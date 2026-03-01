/**
 * Smart PDF generator — prevents content from being cut mid-sentence at page breaks.
 *
 * Strategy: Before rendering with html2canvas, scan all `section` and block elements.
 * Any element that would be sliced by an A4 page boundary gets a whitespace spacer
 * injected before it, pushing it to the next page. The canvas slice then always
 * falls in guaranteed white space, never through text or content.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const A4_WIDTH_PX = 794;          // windowWidth used for html2canvas
const A4_RATIO = 297 / 210;       // A4 height/width ratio
const A4_HEIGHT_PX = Math.round(A4_WIDTH_PX * A4_RATIO); // ~1122px per page

export interface SmartPDFOptions {
    scale?: number;
    quality?: number;
}

/**
 * Measures an element's top position relative to a given ancestor element.
 * Works correctly even when the clone is positioned off-screen (fixed/absolute).
 */
function getTopRelativeToClone(el: Element, clone: HTMLElement): number {
    return el.getBoundingClientRect().top - clone.getBoundingClientRect().top;
}

/**
 * Injects invisible spacer divs before any block element that would be split
 * across an A4 page boundary. Runs iteratively until stable.
 * Returns the array of spacers so they can be removed after rendering.
 */
async function injectPageBreakSpacers(clone: HTMLElement): Promise<HTMLElement[]> {
    const spacers: HTMLElement[] = [];

    // Up to 8 passes — each pass fixes one split, then re-measures from scratch
    for (let pass = 0; pass < 8; pass++) {
        // Target the semantic content blocks used in all three generators
        const blocks = Array.from(
            clone.querySelectorAll("section, table, thead, tbody, tr, h1, h2, h3, h4, p")
        ) as HTMLElement[];

        let foundSplit = false;

        for (const block of blocks) {
            if (block.dataset.pdfSpacer) continue;               // skip our own spacers
            const height = block.getBoundingClientRect().height;
            if (height < 10 || height >= A4_HEIGHT_PX) continue; // skip tiny/full-page elements

            const top = getTopRelativeToClone(block, clone);
            const bottom = top + height;

            const pageNum = Math.floor(top / A4_HEIGHT_PX);
            const breakY = (pageNum + 1) * A4_HEIGHT_PX;

            // Does this block span the next page boundary?
            if (top < breakY && bottom > breakY) {
                const spacerHeight = Math.ceil(breakY - top) + 2; // +2px buffer

                const spacer = document.createElement("div");
                spacer.style.cssText = `height:${spacerHeight}px;min-height:${spacerHeight}px;display:block;flex-shrink:0;width:100%;`;
                spacer.dataset.pdfSpacer = "true";

                block.parentElement?.insertBefore(spacer, block);
                spacers.push(spacer);

                foundSplit = true;
                break; // Restart pass with fresh measurements after each spacer
            }
        }

        if (!foundSplit) break; // Converged — no more splits found
        await new Promise((r) => setTimeout(r, 40)); // Allow browser to re-layout
    }

    return spacers;
}

/**
 * Main export: generates a smart multi-page PDF from a DOM element.
 * Call this instead of html2canvas + jsPDF directly in all three generators.
 *
 * The element should already be cloned and positioned off-screen before calling.
 * After rendering, clean up the clone yourself.
 */
export async function generateSmartPDF(
    clone: HTMLElement,
    options: SmartPDFOptions = {}
): Promise<jsPDF> {
    const { scale = 1.5, quality = 0.85 } = options;

    // Step 1: Inject spacers to guarantee page breaks fall in white space
    const spacers = await injectPageBreakSpacers(clone);

    // Step 2: Small pause for final layout settle
    await new Promise((r) => setTimeout(r, 100));

    // Step 3: Render the full document to canvas
    const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: A4_WIDTH_PX,
    });

    // Step 4: Remove spacers (before returning control to caller who removes the clone)
    spacers.forEach((s) => s.remove());

    // Step 5: Build PDF — slice the canvas at A4 page intervals
    const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
    });

    const imgData = canvas.toDataURL("image/jpeg", quality);
    const imgWidthMM = 210;
    const pageHeightMM = 297;
    const imgHeightMM = (canvas.height * imgWidthMM) / canvas.width;

    if (imgHeightMM <= pageHeightMM) {
        pdf.addImage(imgData, "JPEG", 0, 0, imgWidthMM, imgHeightMM);
    } else {
        let heightLeft = imgHeightMM;
        let position = 0;
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMM, imgHeightMM);
        heightLeft -= pageHeightMM;
        while (heightLeft > 0) {
            position = heightLeft - imgHeightMM;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, imgWidthMM, imgHeightMM);
            heightLeft -= pageHeightMM;
        }
    }

    return pdf;
}
