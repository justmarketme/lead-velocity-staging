/**
 * Builds the Lead Generation Services Agreement as a Word document (.docx).
 *
 * Input is the resolved block list from src/lib/contract/agreement.ts — the same structure the
 * on-screen preview renders — so Word, PDF and preview always carry identical wording.
 * Layout mirrors deliverables/contracts-drafter/lead-generation-agreement/build-docx.mjs
 * (A4, Arial, literal clause numbers with hanging indents, yellow-highlighted unfilled [PLACEHOLDERS],
 * page x of y footer). Client output: no drafting banner; internal notes only if the caller resolved
 * the agreement with include_notes (never on the email / save path).
 * Logo is exported as PNG (transparent background); PDF/preview keep using webp.
 */
import {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    HeadingLevel,
    ImageRun,
    Packer,
    PageNumber,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
} from "docx";
import { AGREEMENT_TITLE, type Inline, type ResolvedAgreement } from "@/lib/contract/agreement";

export type BuildContractDocxOptions = {
    /** Logo URL (e.g. Vite-resolved webp). Fetched and exported as PNG (transparent) for docx. */
    logoUrl?: string;
};

const FONT = "Arial";
const PAGE_W = 11906; // A4 in twips
const PAGE_H = 16838;
const MARGIN = 1304; // ~2.3 cm
const CONTENT_W = PAGE_W - 2 * MARGIN;
const GREY = "595959";
const INDENT: Record<number, number> = { 1: 720, 2: 1440, 3: 2160 };

type RunBase = { bold?: boolean; italics?: boolean; color?: string; size?: number; noHighlight?: boolean };

function runs(inl: Inline[], base: RunBase = {}): TextRun[] {
    return inl.map((i) => {
        const bold = base.bold || i.bold;
        const common = { font: FONT, bold, italics: base.italics, color: base.color, size: base.size };
        if (i.kind === "text") return new TextRun({ text: i.text, ...common });
        if (i.blank) return new TextRun({ text: "________________", ...common });
        if (i.confirm) return new TextRun({ text: i.value || "", ...common, highlight: "yellow" });
        if (i.value) return new TextRun({ text: i.value, ...common });
        return new TextRun({ text: i.token, ...common, highlight: base.noHighlight ? undefined : "yellow" });
    });
}

function numbered(num: string, inl: Inline[], level: number): Paragraph {
    const left = INDENT[level] || 2160;
    return new Paragraph({
        spacing: { after: 120 },
        indent: { left, hanging: 720 },
        tabStops: [{ type: "left", position: left }],
        children: [new TextRun({ text: num + "\t", font: FONT }), ...runs(inl)],
    });
}

function listItem(letter: string, inl: Inline[], level: number): Paragraph {
    const left = (INDENT[level] || 720) + 567;
    return new Paragraph({
        spacing: { after: 80 },
        indent: { left, hanging: 567 },
        tabStops: [{ type: "left", position: left }],
        children: [new TextRun({ text: `(${letter})\t`, font: FONT }), ...runs(inl)],
    });
}

function sideNote(inl: Inline[], level: number): Paragraph {
    return new Paragraph({
        spacing: { before: 60, after: 160 },
        indent: { left: INDENT[level] || 720 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: "A6A6A6", space: 6 } },
        children: runs(inl, { italics: true, color: GREY, size: 18, noHighlight: true }),
    });
}

function table(rows: Inline[][][]): Table {
    const cols = rows[0]?.length || 1;
    const colW = Math.floor(CONTENT_W / cols);
    return new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: Array(cols).fill(colW),
        rows: rows.map(
            (row, i) =>
                new TableRow({
                    tableHeader: i === 0,
                    cantSplit: true,
                    children: row.map(
                        (c) =>
                            new TableCell({
                                width: { size: colW, type: WidthType.DXA },
                                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                                shading: i === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "D9E2F3" } : undefined,
                                children: [new Paragraph({ children: runs(c, i === 0 ? { bold: true } : {}) })],
                            })
                    ),
                })
        ),
    });
}

/** Fetches logo and exports as PNG so transparency is preserved (no black background). */
async function loadLogoAsPng(logoUrl: string): Promise<{ data: ArrayBuffer; width: number; height: number; type: "png" } | undefined> {
    try {
        const res = await fetch(logoUrl);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const png = await new Promise<Blob | null>((resolve) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                // 3x the printed width is plenty; the source logo is far larger and bloats the .docx
                const w = Math.min(img.naturalWidth, 480);
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = Math.round((img.naturalHeight * w) / img.naturalWidth);
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve(null);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((b) => resolve(b), "image/png");
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(null);
            };
            img.src = objectUrl;
        });
        if (!png) return undefined;
        const bitmap = await createImageBitmap(png);
        const maxW = 160;
        const w = Math.min(maxW, bitmap.width);
        const h = Math.round((bitmap.height * w) / bitmap.width);
        bitmap.close();
        return { data: await png.arrayBuffer(), width: w, height: h, type: "png" };
    } catch {
        return undefined;
    }
}

export async function buildContractDocx(doc: ResolvedAgreement, options?: BuildContractDocxOptions): Promise<Blob> {
    const children: (Paragraph | Table)[] = [];

    if (options?.logoUrl) {
        const logo = await loadLogoAsPng(options.logoUrl);
        if (logo)
            children.push(
                new Paragraph({
                    spacing: { after: 200 },
                    children: [new ImageRun({ type: logo.type, data: logo.data, transformation: { width: logo.width, height: logo.height } })],
                })
            );
    }

    for (const b of doc.blocks) {
        switch (b.type) {
            case "banner":
                break; // internal drafting banner: never in client output
            case "title":
                children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: runs(b.inl) }));
                break;
            case "h2":
                children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: b.pageBreak, keepNext: true, children: runs(b.inl) }));
                break;
            case "h3":
                children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: runs(b.inl) }));
                break;
            case "clause":
                children.push(numbered(b.num, b.inl, b.level));
                break;
            case "item":
                children.push(listItem(b.letter, b.inl, b.level));
                break;
            case "recital":
                children.push(numbered(b.letter + ".", b.inl, 1));
                break;
            case "note":
                children.push(sideNote(b.inl, b.level));
                break;
            case "table":
                children.push(table(b.rows), new Paragraph({ spacing: { after: 120 }, children: [] }));
                break;
            default:
                children.push(new Paragraph({ spacing: { after: 120 }, children: runs(b.inl) }));
        }
    }

    const heading = (id: string, name: string, size: number, extra: Record<string, unknown> = {}) => ({
        id,
        name,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: FONT, size, bold: true, color: "1F3864" },
        paragraph: { spacing: { before: 240, after: 120 }, ...extra },
    });

    const document = new Document({
        creator: "Lead Velocity (Pty) Ltd",
        title: AGREEMENT_TITLE,
        styles: {
            default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 264 } } } },
            paragraphStyles: [
                heading("Title", "Title", 32, { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 } }),
                heading("Heading1", "Heading 1", 24, { outlineLevel: 0 }),
                heading("Heading2", "Heading 2", 22, { outlineLevel: 1 }),
            ],
        },
        sections: [
            {
                properties: {
                    page: {
                        size: { width: PAGE_W, height: PAGE_H },
                        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 600, footer: 600 },
                    },
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({
                                        size: 16,
                                        color: GREY,
                                        font: FONT,
                                        children: [`Lead Velocity — ${AGREEMENT_TITLE} ${doc.templateVersion}   ·   Page `, PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                                    }),
                                ],
                            }),
                        ],
                    }),
                },
                children,
            },
        ],
    });

    return Packer.toBlob(document);
}
