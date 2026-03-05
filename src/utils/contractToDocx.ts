/**
 * Builds a Word document (.docx) from contract form data.
 * Matches preview design: logo, serif font, all section colours, party boxes, section styling.
 * Logo is exported as PNG (transparent background); PDF/preview keep using webp.
 */
import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    ImageRun,
    ShadingType,
    Table,
    TableRow,
    TableCell,
    WidthType,
} from "docx";

export type ContractDataForDocx = Record<string, string | undefined>;

export type BuildContractDocxOptions = {
    /** Logo URL (e.g. Vite-resolved webp). Fetched and exported as PNG (transparent) for docx. */
    logoUrl?: string;
};

const FONT = "Times New Roman";
const COLOR = {
    title: "1e293b",
    subtitle: "64748b",
    heading: "1e40af",
    label: "be185d",
    body: "334155",
    muted: "64748b",
    serviceFee: "be185d",
    // Section-specific (match preview)
    slate: "475569",
    slateHeading: "0f172a",
    red: "b91c1c",
    redHeading: "7f1d1d",
    redBody: "991b1b",
    amber: "d97706",
    amberHeading: "78350f",
    amberBody: "92400e",
    green: "059669",
    greenHeading: "14532d",
    greenBody: "166534",
    blue: "2563eb",
    blueHeading: "1e3a8a",
    blueBody: "1e40af",
    purple: "7c3aed",
    purpleHeading: "4c1d95",
    purpleBody: "5b21b6",
    orange: "ea580c",
    orangeHeading: "7c2d12",
    orangeBody: "9a3412",
};
// Light fills for tinted sections (match bg-*-50)
const FILL = {
    red: "fef2f2",
    amber: "fffbeb",
    green: "f0fdf4",
    blue: "eff6ff",
    purple: "f5f3ff",
    orange: "fff7ed",
    slate: "f8fafc",
};

function run(text: string, opts: { bold?: boolean; italic?: boolean; size?: number; color?: string; allCaps?: boolean } = {}) {
    return new TextRun({
        text: opts.allCaps ? text.toUpperCase() : text,
        font: FONT,
        bold: opts.bold,
        italics: opts.italic,
        size: opts.size ?? 24,
        color: opts.color ?? COLOR.body,
    });
}

function heading(text: string, level: "Title" | "Heading1" | "Heading2" = "Heading2"): Paragraph {
    return new Paragraph({
        children: [run(text, { bold: true, size: level === "Title" ? 32 : 28, color: level === "Title" ? COLOR.title : COLOR.heading })],
        heading: level === "Title" ? HeadingLevel.TITLE : level === "Heading1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
    });
}

function body(text: string, options?: { italic?: boolean; color?: string }): Paragraph {
    return new Paragraph({
        children: [run(text, { italic: options?.italic, color: options?.color ?? COLOR.body })],
        spacing: { after: 120 },
    });
}

function sectionHeading(
    num: string,
    title: string,
    opts?: { barColor?: string; headingColor?: string; shading?: string }
): Paragraph {
    const text = num ? `${num}. ${title}` : title;
    const barColor = opts?.barColor ?? "be185d";
    const headingColor = opts?.headingColor ?? COLOR.heading;
    return new Paragraph({
        children: [run(text, { bold: true, size: 26, color: headingColor })],
        heading: HeadingLevel.HEADING_2,
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: barColor } },
        shading: opts?.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
        spacing: { before: 240, after: 120 },
    });
}

function partyBoxLabel(text: string): Paragraph {
    return new Paragraph({
        children: [run(text, { bold: true, size: 18, color: COLOR.label, allCaps: true })],
        spacing: { before: 0, after: 80 },
    });
}

/** Fetches logo and exports as PNG so transparency is preserved (no black background). */
async function loadLogoAsPng(logoUrl: string): Promise<{ data: ArrayBuffer; width: number; height: number; type: "png" } | undefined> {
    try {
        const res = await fetch(logoUrl);
        const blob = await res.blob();
        const isWebp = blob.type === "image/webp" || /\.webp$/i.test(logoUrl);
        let drawable: Blob | null = blob;
        if (isWebp || blob.type === "image/png") {
            const objectUrl = URL.createObjectURL(blob);
            drawable = await new Promise<Blob | null>((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    URL.revokeObjectURL(objectUrl);
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        resolve(null);
                        return;
                    }
                    // Don't fill canvas - leave transparent so logo has no black background
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((b) => resolve(b), "image/png");
                };
                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    resolve(null);
                };
                img.src = objectUrl;
            });
            if (!drawable) return undefined;
        } else if (blob.type !== "image/png") {
            return undefined;
        }
        const arrayBuffer = await drawable.arrayBuffer();
        const bitmap = await createImageBitmap(drawable);
        const maxW = 200;
        const w = bitmap.width > maxW ? maxW : bitmap.width;
        const h = bitmap.width > maxW ? Math.round((bitmap.height * maxW) / bitmap.width) : bitmap.height;
        bitmap.close();
        return { data: arrayBuffer, width: w, height: h, type: "png" };
    } catch {
        return undefined;
    }
}

export async function buildContractDocx(
    data: ContractDataForDocx,
    options?: BuildContractDocxOptions
): Promise<Blob> {
    const d = (k: string) => data[k] ?? "";
    const children: (Paragraph | Table)[] = [];

    // Header: logo + title/subtitle on left, "The Client" box on right (match preview)
    const headerLeft: (Paragraph | Table)[] = [];
    if (options?.logoUrl) {
        const logoData = await loadLogoAsPng(options.logoUrl);
        if (logoData) {
            headerLeft.push(
                new Paragraph({
                    children: [
                        new ImageRun({
                            type: logoData.type,
                            data: logoData.data,
                            transformation: { width: logoData.width, height: logoData.height },
                        }),
                    ],
                    spacing: { after: 120 },
                })
            );
        }
    }
    headerLeft.push(
        new Paragraph({
            children: [run(d("title"), { bold: true, size: 32, color: COLOR.title })],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.LEFT,
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [run(d("subtitle"), { size: 24, color: COLOR.subtitle })],
            alignment: AlignmentType.LEFT,
            spacing: { after: 0 },
        })
    );

    const headerTable = new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: headerLeft,
                        width: { size: 65, type: WidthType.PERCENTAGE },
                        shading: undefined,
                    }),
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [run("The Client", { bold: true, size: 18, color: COLOR.muted, allCaps: true })],
                                alignment: AlignmentType.RIGHT,
                                spacing: { after: 60 },
                            }),
                            new Paragraph({
                                children: [run(d("clientName"), { bold: true, size: 28, color: COLOR.title })],
                                alignment: AlignmentType.RIGHT,
                                spacing: { after: 60 },
                            }),
                            new Paragraph({
                                children: [run(d("clientCompany"), { size: 22, color: COLOR.subtitle })],
                                alignment: AlignmentType.RIGHT,
                                spacing: { after: 0 },
                            }),
                        ],
                        width: { size: 35, type: WidthType.PERCENTAGE },
                        shading: { fill: "f8fafc", type: ShadingType.CLEAR },
                        margins: { top: 100, bottom: 100, left: 200, right: 200 },
                    }),
                ],
            }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 12, color: "e2e8f0" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    });
    children.push(headerTable);
    children.push(new Paragraph({ spacing: { before: 240, after: 0 } }));

    // Parties to this Agreement (blue heading, intro in grey)
    children.push(
        new Paragraph({
            children: [run("Parties to this Agreement", { bold: true, size: 26, color: COLOR.heading })],
            heading: HeadingLevel.HEADING_2,
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: "be185d" } },
            spacing: { before: 240, after: 120 },
        }),
        new Paragraph({
            children: [run('This Service Level Agreement ("Agreement") is entered into as of the Effective Date set out below, by and between:', { size: 22, color: COLOR.muted })],
            spacing: { after: 200 },
        })
    );

    // The Service Provider (box label + content)
    children.push(partyBoxLabel("The Service Provider"));
    children.push(
        new Paragraph({
            children: [run(d("providerCompany"), { bold: true, size: 28, color: COLOR.title })],
            spacing: { after: 80 },
        }),
        body(d("providerAddressLine")),
        body(d("providerEmailLine")),
        body(d("providerPhoneLine")),
        body(d("providerRepresentativeLine")),
        new Paragraph({
            children: [run('(hereinafter referred to as "Lead Velocity" or "the Service Provider")', { italic: true, size: 22, color: COLOR.muted })],
            spacing: { after: 200 },
        })
    );

    // The Client (box label + content)
    children.push(partyBoxLabel("The Client"));
    children.push(
        new Paragraph({
            children: [run(d("clientCompany"), { bold: true, size: 28, color: COLOR.title })],
            spacing: { after: 80 },
        }),
        body(d("clientAddressLine")),
        body(d("clientEmailLine")),
        body(d("clientPhoneLine")),
        body(d("clientRepresentativeLine")),
        new Paragraph({
            children: [run('(hereinafter referred to as "the Client")', { italic: true, size: 22, color: COLOR.muted })],
            spacing: { after: 120 },
        }),
        body('The Service Provider and the Client are collectively referred to as "the Parties" and individually as a "Party".')
    );

    // Recitals (slate bar, italic)
    children.push(sectionHeading("", "Recitals", { barColor: COLOR.slate, headingColor: COLOR.slateHeading }));
    children.push(body(d("recitalsText"), { italic: true, color: COLOR.muted }));
    children.push(sectionHeading("", "Definitions & Interpretation"));
    children.push(body(d("definitionsText")));
    children.push(sectionHeading("1", "Scope of Services"));
    children.push(body(d("scopeText")));
    children.push(sectionHeading("2", "Deliverables"));
    children.push(body(d("deliverablesText")));

    // Commercial Terms (heading + service fee in pink)
    children.push(
        new Paragraph({
            children: [run("COMMERCIAL TERMS", { bold: true, size: 22, color: COLOR.muted })],
            spacing: { before: 240, after: 120 },
        }),
        new Paragraph({
            children: [
                run("SERVICE FEE: ", { bold: true, size: 22, color: COLOR.muted }),
                run(d("serviceFee"), { bold: true, size: 28, color: COLOR.serviceFee }),
            ],
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                run("LEAD TARGET: ", { bold: true, size: 22, color: COLOR.muted }),
                run(d("leadTarget")),
            ],
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                run("DURATION: ", { bold: true, size: 22, color: COLOR.muted }),
                run("30 Days"),
            ],
            spacing: { after: 120 },
        })
    );
    if (d("commissionText")) {
        children.push(
            new Paragraph({
                children: [run("COMMISSION STRUCTURE", { bold: true, size: 22, color: COLOR.serviceFee })],
                spacing: { before: 200, after: 80 },
            }),
            body(d("commissionText"))
        );
    }

    // Numbered sections 3–20 (section-specific colours to match preview)
    children.push(sectionHeading("3", "Terms & Conditions"));
    children.push(body(d("termsText")));
    children.push(sectionHeading("4", "Confidentiality"));
    children.push(body(d("confidentialityText")));
    // 5. Breach (red)
    children.push(sectionHeading("5", "Breach & No-Refund Policy", { barColor: COLOR.red, headingColor: COLOR.redHeading, shading: FILL.red }));
    children.push(body(d("breachText"), { color: COLOR.redBody }));
    children.push(body(d("refundText"), { color: COLOR.redBody }));
    children.push(sectionHeading("6", "Governing Law & Disputes"));
    children.push(body(d("disputeText")));
    if (d("pilotEligibilityText")) {
        children.push(sectionHeading("7", "Pilot Eligibility", { barColor: COLOR.amber, headingColor: COLOR.amberHeading, shading: FILL.amber }));
        children.push(body(d("pilotEligibilityText"), { color: COLOR.amberBody }));
    }
    // 8. Renewal (green)
    children.push(sectionHeading("8", "Renewal & Upgrade Options", { barColor: COLOR.green, headingColor: COLOR.greenHeading, shading: FILL.green }));
    children.push(body(d("renewalText"), { color: COLOR.greenBody }));
    children.push(sectionHeading("9", "Force Majeure"));
    children.push(body(d("forceMajeureText")));
    children.push(sectionHeading("10", "Limitation of Liability"));
    children.push(body(d("liabilityText")));
    children.push(sectionHeading("11", "Indemnification"));
    children.push(body(d("indemnityText")));
    if (d("jurisdictionText")) {
        children.push(sectionHeading("", "Governing Law"));
        children.push(body(d("jurisdictionText")));
    }
    // 12. General (slate)
    children.push(sectionHeading("12", "General Provisions", { barColor: COLOR.slate, headingColor: COLOR.slateHeading, shading: FILL.slate }));
    children.push(body(d("entireAgreementText"), { color: COLOR.body }));
    children.push(sectionHeading("13", "Intellectual Property"));
    children.push(body(d("intellectualPropertyText")));
    // 14. Data Protection (blue)
    children.push(sectionHeading("14", "Data Protection & POPIA Compliance", { barColor: COLOR.blue, headingColor: COLOR.blueHeading, shading: FILL.blue }));
    children.push(body(d("dataProtectionText"), { color: COLOR.blueBody }));
    // 15. Non-Solicitation (purple)
    children.push(sectionHeading("15", "Non-Solicitation & Protection of Methods", { barColor: COLOR.purple, headingColor: COLOR.purpleHeading, shading: FILL.purple }));
    children.push(body(d("nonSolicitationText"), { color: COLOR.purpleBody }));
    children.push(sectionHeading("16", "Warranties & Representations"));
    children.push(body(d("warrantiesText")));
    // 17. Termination (orange)
    children.push(sectionHeading("17", "Termination", { barColor: COLOR.orange, headingColor: COLOR.orangeHeading, shading: FILL.orange }));
    children.push(body(d("terminationText"), { color: COLOR.orangeBody }));
    children.push(sectionHeading("18", "Assignment"));
    children.push(body(d("assignmentText")));
    children.push(sectionHeading("19", "Notices"));
    children.push(body(d("noticesText")));
    children.push(sectionHeading("20", "Relationship of Parties"));
    children.push(body(d("relationshipText")));

    if (d("bankName") || d("accountHolder")) {
        const paymentColor = "e2e8f0";
        children.push(
            new Paragraph({
                children: [run("Payment Details", { bold: true, size: 26, color: "ffffff" })],
                shading: { fill: "0f172a", type: ShadingType.CLEAR },
                spacing: { before: 320, after: 120 },
            }),
            new Paragraph({
                children: [run(`Bank: ${d("bankName")}`, { color: paymentColor })],
                shading: { fill: "0f172a", type: ShadingType.CLEAR },
                spacing: { after: 80 },
            }),
            new Paragraph({
                children: [run(`Account Holder: ${d("accountHolder")}`, { color: paymentColor })],
                shading: { fill: "0f172a", type: ShadingType.CLEAR },
                spacing: { after: 80 },
            }),
            new Paragraph({
                children: [run(`Account #: ${d("accountNumber")}`, { color: paymentColor })],
                shading: { fill: "0f172a", type: ShadingType.CLEAR },
                spacing: { after: 80 },
            }),
            new Paragraph({
                children: [run(`Branch Code: ${d("branchCode")}`, { color: paymentColor })],
                shading: { fill: "0f172a", type: ShadingType.CLEAR },
                spacing: { after: 120 },
            })
        );
    }
    children.push(
        new Paragraph({
            children: [run(`Effective Date: ${d("effectiveDate")}`)],
            spacing: { before: 320, after: 80 },
        }),
        new Paragraph({
            children: [run(`Client: ${d("clientName")}`)],
            spacing: { after: 400 },
        })
    );

    const doc = new Document({
        sections: [{ children }],
    });

    return Packer.toBlob(doc);
}
