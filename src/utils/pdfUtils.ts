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

    // Handle manual page breaks FIRST
    const manualBreaks = Array.from(clone.querySelectorAll(".pdf-page-break-before")) as HTMLElement[];
    let manualBreakInjected = false;
    for (const mb of manualBreaks) {
        const top = getTopRelativeToClone(mb, clone);
        const pageNum = Math.floor(top / A4_HEIGHT_PX);
        const breakY = (pageNum + 1) * A4_HEIGHT_PX;

        const distanceToNextPage = breakY - top;
        // Only push to next page if it's not already within the first ~20px of a new page
        if (distanceToNextPage < A4_HEIGHT_PX - 20 && distanceToNextPage > 0) {
            // Use exact distance — Section 13 starts exactly at the page boundary.
            // Top margin removal is handled separately via JS after injection.
            const spacerHeight = Math.ceil(distanceToNextPage);
            const spacer = document.createElement("div");
            spacer.style.cssText = `height:${spacerHeight}px;min-height:${spacerHeight}px;display:block;flex-shrink:0;width:100%;margin:0;padding:0;background:white;`;
            spacer.dataset.pdfSpacer = "true";
            mb.parentElement?.insertBefore(spacer, mb);
            spacers.push(spacer);
            manualBreakInjected = true;
        }
    }

    if (manualBreakInjected) {
        await new Promise((r) => setTimeout(r, 40)); // Allow browser to re-layout
    }

    // Up to 8 passes — each pass fixes one split, then re-measures from scratch
    for (let pass = 0; pass < 8; pass++) {
        // Target the semantic content blocks used in all three generators
        // We avoid table-internal tags (tr, thead, etc) for spacer injection as they break DOM structure
        const blocks = Array.from(
            clone.querySelectorAll("section, .pdf-block, .document-section, .invoice-section, table, h1, h2, h3")
        ) as HTMLElement[];

        let foundSplit = false;

        for (const block of blocks) {
            if (block.dataset.pdfSpacer) continue;               // skip our own spacers
            const height = block.getBoundingClientRect().height;
            if (height < 30 || height >= A4_HEIGHT_PX * 0.9) continue; // skip tiny or nearly full-page elements

            const top = getTopRelativeToClone(block, clone);
            const bottom = top + height;

            const pageNum = Math.floor(top / A4_HEIGHT_PX);
            const breakY = (pageNum + 1) * A4_HEIGHT_PX;

            // Does this block span the next page boundary?
            // Apply a larger safety margin (25px) to ensure no slicing
            if (top < breakY && bottom > (breakY - 25)) {
                const spacerHeight = Math.ceil(breakY - top) + 10; // +10px buffer

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

    // Step 1.5: Surgical removal of top-of-page whitespace for manual breaks
    await collapseTopGapsAfterManualBreaks(clone);

    return spacers;
}

/**
 * After all spacers have been injected, this step precisely measures the
 * remaining gap between the page boundary and the first element on each
 * new page (following a manual .pdf-page-break-before marker), then
 * collapses that gap via a negative margin-top. This fixes the large
 * white space at the top of Section 13's page without affecting other pages.
 */
async function collapseTopGapsAfterManualBreaks(clone: HTMLElement): Promise<void> {
    await new Promise((r) => setTimeout(r, 40)); // wait for layout after spacer injection

    const manualBreaks = Array.from(clone.querySelectorAll('.pdf-page-break-before')) as HTMLElement[];

    for (const mb of manualBreaks) {
        const nextSection = mb.nextElementSibling as HTMLElement | null;
        if (!nextSection) continue;

        const sectionTop = getTopRelativeToClone(nextSection, clone);
        const pageNum = Math.ceil(sectionTop / A4_HEIGHT_PX); // page this section is ON
        const pageStartY = (pageNum - 1) * A4_HEIGHT_PX; // top of that page in pixels

        const gap = sectionTop - pageStartY;

        // If there's a gap between the page start and the section, collapse it effectively
        if (gap > 2) {
            // Slightly over-pull (+2px) to ensure it clears any hidden parent padding
            nextSection.style.setProperty('margin-top', `-${Math.floor(gap) + 2}px`, 'important');
            console.log(`PDF DEBUG: Collapsed gap of ${gap}px above section after manual break.`);
        }
    }
}

/**
 * Converts an image element or URL to a JPEG data URL.
 * Ensures consistent rendering and removes transparency issues.
 */
async function imageToJPEG(img: HTMLImageElement): Promise<string | null> {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        // Fill white background for transparency
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        return canvas.toDataURL("image/jpeg", 0.95);
    } catch (e) {
        console.error("PDF DEBUG: imageToJPEG failed", e);
        return null;
    }
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
    const { scale = 1.5, quality = 0.92 } = options;
    const startTime = Date.now();

    console.log("PDF DEBUG: generateSmartPDF v3 starting...");

    // CRITICAL: Force exact pixel width and full visibility
    clone.style.width = `${A4_WIDTH_PX}px`;
    clone.style.maxWidth = `${A4_WIDTH_PX}px`;
    clone.style.position = "absolute";
    clone.style.top = "0px";
    clone.style.left = "-9999px";
    clone.style.zIndex = "-9999";
    clone.style.opacity = "1";
    clone.style.visibility = "visible";
    clone.style.display = "block";
    clone.style.pointerEvents = "none";
    clone.style.overflow = "visible";
    clone.style.backgroundColor = "#ffffff";

    // Ensure clone is in the DOM
    if (!clone.parentElement) {
        document.body.appendChild(clone);
    }

    // Step 0: Prepare Images (Convert SVGs/PNGs to JPEGs where possible to avoid corruption)
    const images = clone.querySelectorAll("img");
    for (const img of Array.from(images)) {
        img.style.maxWidth = "100%";
        img.crossOrigin = "anonymous";

        // Convert to solid JPEG if it's a small asset or logo
        // Wait for it to load first
        if (!img.complete) {
            await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }

        const jpegData = await imageToJPEG(img);
        if (jpegData) {
            img.src = jpegData;
        }
    }

    // Step 1: Inject Spacers to prevent mid-content page breaks
    console.log("PDF DEBUG: Injecting page break spacers...");
    const injectedSpacers = await injectPageBreakSpacers(clone);
    console.log(`PDF DEBUG: Injected ${injectedSpacers.length} spacers.`);

    // Wait for paint — requestAnimationFrame + setTimeout guarantees it
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
            setTimeout(resolve, 400); // 400ms buffer for layout stability
        });
    });

    const cloneRect = clone.getBoundingClientRect();
    console.log(`PDF DEBUG: Clone dimensions: ${cloneRect.width}x${cloneRect.height}`);

    if (cloneRect.height < 10) {
        console.error("PDF DEBUG: Clone has no height! Content may not have rendered.");
    }

    console.log(`PDF DEBUG: html2canvas starting (scale=${scale}, windowWidth=${A4_WIDTH_PX})...`);
    const canvas = await html2canvas(clone, {
        scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: A4_WIDTH_PX,
        logging: false,
        allowTaint: true,
        onclone: (doc: Document, el: HTMLElement) => {
            // Final check on cloned document
        }
    });

    // Step 2: Cleanup spacers immediately after canvas is created
    injectedSpacers.forEach(s => s.remove());

    console.log(`PDF DEBUG: Canvas created: ${canvas.width}x${canvas.height}`);

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error("PDF Generation Failed: html2canvas produced empty canvas.");
    }

    // Build the PDF
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

    console.log(`PDF DEBUG: Image dimensions in mm: ${imgWidthMM} x ${imgHeightMM}`);

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

    const elapsed = Date.now() - startTime;
    const pageCount = pdf.getNumberOfPages();
    console.log(`PDF DEBUG: SUCCESS — ${pageCount} pages, ${elapsed}ms total`);
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
