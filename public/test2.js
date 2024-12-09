const iframe = document.getElementById("iframe");
const overlay = document.getElementById("overlay");
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

// Enable element selection
iframe.addEventListener("load", () => {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

    iframeDoc.body.addEventListener("mouseover", (e) => {
        const el = iframeDoc.elementFromPoint(e.clientX, e.clientY);
        if (el) {
            overlay.style.outline = "2px solid red";
            overlay.style.pointerEvents = "none";
            const rect = el.getBoundingClientRect();
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;
            overlay.style.left = `${rect.left}px`;
            overlay.style.top = `${rect.top}px`;

            selectedElement = el;
        }
    });

    iframeDoc.body.addEventListener("click", () => {
        scrapeBtn.disabled = false;
    });
});

scrapeBtn.addEventListener("click", async () => {
    if (!selectedElement) return;

    const website = document.getElementById("website").value;
    const selector = selectedElement.tagName.toLowerCase();

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