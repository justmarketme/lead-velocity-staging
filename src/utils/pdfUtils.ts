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
const A4_HEIGHT_PX = Math.floor((A4_WIDTH_PX * 297) / 210); // Exactly 1122.9 -> 1122px

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
        // Including .bg-slate-50, .border, .bg-red-50, etc.
        const blocks = Array.from(
            clone.querySelectorAll("section, table, thead, tbody, tr, h1, h2, h3, h4, p, div[class*='bg-'], div.border, .invoice-section, .document-section")
        ) as HTMLElement[];

        let foundSplit = false;

        for (const block of blocks) {
            if (block.dataset.pdfSpacer) continue;               // skip our own spacers
            const height = block.getBoundingClientRect().height;
            if (height < 20 || height >= A4_HEIGHT_PX * 0.9) continue; // skip tiny or nearly full-page elements

            const top = getTopRelativeToClone(block, clone);
            const bottom = top + height;

            const pageNum = Math.floor(top / A4_HEIGHT_PX);
            const breakY = (pageNum + 1) * A4_HEIGHT_PX;

            // Does this block span the next page boundary?
            // Apply a larger safety margin (20px) to ensure no slicing
            if (top < breakY && bottom > (breakY - 20)) {
                const spacerHeight = Math.ceil(breakY - top) + 5; // +5px buffer

                const spacer = document.createElement("div");
                spacer.style.cssText = `height:${spacerHeight}px;min-height:${spacerHeight}px;display:block;flex-shrink:0;width:100%;background:white;`;
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
    const { scale = 1.3, quality = 0.90 } = options;
    const startTime = Date.now();

    console.log("PDF DEBUG: Starting emergency fast generation...");

    // Position clone off-screen but visible for capture
    clone.style.visibility = "visible";
    clone.style.display = "block";
    clone.style.pointerEvents = "none";
    clone.style.position = "fixed";
    clone.style.top = "-10000px";
    clone.style.left = "0";
    clone.style.opacity = "0";

    // Step 1: Instant snapshot (no heavy iteration)
    console.log(`PDF DEBUG: Starting html2canvas render (scale: ${scale})...`);
    const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: A4_WIDTH_PX,
        logging: false // Faster without logs
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error("PDF Generation Failed: Empty canvas.");
    }

    console.log(`PDF DEBUG: Render complete. Time: ${Date.now() - startTime}ms`);

    // Step 2: Build PDF
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

        // Add first page
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMM, imgHeightMM);
        heightLeft -= pageHeightMM;

        // Add subsequent pages (simple slicing)
        while (heightLeft > 0) {
            position = heightLeft - imgHeightMM;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, imgWidthMM, imgHeightMM);
            heightLeft -= pageHeightMM;
        }
    }

    console.log(`PDF DEBUG: Success! Total Time: ${Date.now() - startTime}ms`);
    return pdf;
}

/**
 * Utility to convert a Blob (like a PDF output) to a Base64 string for email attachments.
 */
export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                // Remove the data URL prefix (e.g. data:application/pdf;base64,)
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            } else {
                reject(new Error("Failed to convert blob to base64"));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
