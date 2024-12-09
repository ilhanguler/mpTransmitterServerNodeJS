const iframe = document.getElementById("iframe");
const overlay = document.getElementById("overlay");
const overlaySel = document.getElementById("overlaySel");
const scrapeBtn = document.getElementById("scrape-btn");
let selectedElement = null;

document.getElementById("website-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const website = document.getElementById("website").value;

    const response = await fetch("/loadWebsite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
    });

    const data = await response.json();
    if (data.success) {
        iframe.src = data.tempFilePath;
    }
});

iframe.addEventListener("load", () => {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    iframeDoc.body.addEventListener("mouseover", (e) => {
        const rect = iframe.getBoundingClientRect();
        const el = iframeDoc.elementFromPoint(e.clientX, e.clientY);
        if (el) {
            const elRect = el.getBoundingClientRect();
            const iframeOffset = iframe.getBoundingClientRect();

            overlay.style.display = "block";
            // Adjust overlay to match element position
            overlay.style.width = `${elRect.width + 4}px`;
            overlay.style.height = `${elRect.height + 4}px`;
            overlay.style.left = `${elRect.left - 2}px`;
            overlay.style.top = `${elRect.top - 2}px`;
        }
    });

    iframeDoc.body.addEventListener("mouseleave", (e) => {
        
        overlay.style.display = "none";
    });

    iframeDoc.body.addEventListener("scroll", (e) => {
        const rect = iframe.getBoundingClientRect();
        const el = iframeDoc.elementFromPoint(e.clientX, e.clientY);
        if (el) {
            const elRect = el.getBoundingClientRect();
            const iframeOffset = iframe.getBoundingClientRect();

            overlay.style.display = "block";
            // Adjust overlay to match element position
            overlay.style.width = `${elRect.width + 4}px`;
            overlay.style.height = `${elRect.height + 4}px`;
            overlay.style.left = `${elRect.left - 2}px`;
            overlay.style.top = `${elRect.top - 2}px`;

        }
    });

    iframeDoc.body.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrapeBtn.disabled = false

        const el = iframeDoc.elementFromPoint(e.clientX, e.clientY);
        if (el) {
            const elRect = el.getBoundingClientRect();

            overlaySel.style.display = "block";
            // Adjust overlay to match element position
            overlaySel.style.width = `${elRect.width}px`;
            overlaySel.style.height = `${elRect.height}px`;
            overlaySel.style.left = `${elRect.left}px`;
            overlaySel.style.top = `${elRect.top}px`;

            selectedElement = el;

        }
    });
});

scrapeBtn.addEventListener("click", async () => {
    if (!selectedElement) return;

    const website = document.getElementById("website").value;
    const selector = getUniqueSelector(selectedElement);

    const response = await fetch("/scrapeElement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, selector }),
    });

    const data = await response.json();
    if (data.success) {
        alert("Scraped Elements:\n" + data.elements.join("\n"));
    }
});

// Generate unique selector for an element
function getUniqueSelector(el) {
    if (!el) return null;

    let selector = "";
    while (el.tagName) {
        let part = el.tagName.toLowerCase();
        if (el.id) {
            part += `#${el.id}`;
            selector = part + (selector ? ` > ${selector}` : "");
            break;
        } else {
            let siblingIndex = Array.from(el.parentNode.children).indexOf(el) + 1;
            part += `:nth-child(${siblingIndex})`;
            selector = part + (selector ? ` > ${selector}` : "");
            el = el.parentNode;
        }
    }
    return selector;
}