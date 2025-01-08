document.addEventListener("DOMContentLoaded", () => {
    const iframe = document.getElementById("iframe");
    const selectedElementsList = document.getElementById("selected-elements");
    const scrapeButton = document.getElementById("scrape-btn");
    const websiteInput = document.getElementById("website");
    const websiteForm = document.getElementById("website-form");

    let selectedElements = new Map();
    let iframeDoc = null;
    let overlay = null;
    let hoverTarget = null;

    websiteForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const website = websiteInput.value;
        if (!website) return; // Prevent empty submissions

        try {
            const response = await fetch("/loadWebsite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ website }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            if (data.success) {
                iframe.src = data.tempFilePath;
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error("Error loading website:", error);
            alert(`Error loading website: ${error.message}`);
        }
    });

    iframe.addEventListener("load", () => {
        iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) {
            console.error("Could not get iframe document.");
            return;
        }

        const style = iframeDoc.createElement('style');
        style.textContent = `
            .selected-highlight {
                outline: 2px solid blue !important;
            }
            #iframe-overlay {
                position: fixed;
                pointer-events: none;
                z-index: 999;
                border: 2px dashed red;
                transition: all 0.1s ease-out;
            }
        `;
        iframeDoc.head.appendChild(style);

        overlay = iframeDoc.createElement('div');
        overlay.id = "iframe-overlay";
        iframeDoc.body.appendChild(overlay);

        iframeDoc.addEventListener("mousemove", (e) => {
            if (hoverTarget) hoverTarget.classList.remove("hover-overlay");

            hoverTarget = iframeDoc.elementFromPoint(e.clientX, e.clientY);

            if (!hoverTarget || hoverTarget === overlay || hoverTarget.tagName === 'HTML' || hoverTarget.tagName === 'BODY') {
                overlay.style.display = 'none';
                return;
            }
            overlay.style.display = 'block';

            const hoverRect = hoverTarget.getBoundingClientRect();

            overlay.style.top = `${hoverRect.top}px`;
            overlay.style.left = `${hoverRect.left}px`;
            overlay.style.width = `${hoverRect.width}px`;
            overlay.style.height = `${hoverRect.height}px`;
        });

        iframeDoc.addEventListener("click", (e) => {
            e.preventDefault();
            const target = iframeDoc.elementFromPoint(e.clientX, e.clientY);
            if (!target || target === overlay || target.tagName === 'HTML' || target.tagName === 'BODY') return;

            if (selectedElements.has(target)) {
                target.classList.remove("selected-highlight");
                const listItemToRemove = selectedElementsList.querySelector(`[data-element-id="${target.dataset.elementId}"]`);
                if (listItemToRemove) listItemToRemove.remove();
                selectedElements.delete(target);
            } else {
                if (!target.dataset.elementId) target.dataset.elementId = generateUniqueId();
                target.classList.add("selected-highlight");
                const xpath = generateXPath(target);
                selectedElements.set(target, xpath);
                addSelectedElement(target);
            }
            scrapeButton.disabled = selectedElements.size === 0;
        });

        iframeDoc.addEventListener("scroll", updateOverlay);
        iframe.contentWindow.addEventListener("resize", updateOverlay);

        function updateOverlay() {
            if (!hoverTarget || !overlay) return;
            const rect = hoverTarget.getBoundingClientRect();
            overlay.style.left = `${rect.left}px`;
            overlay.style.top = `${rect.top}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;
        }
    });

    function generateUniqueId() {
        return Math.random().toString(36).substring(2, 15);
    }

    function generateXPath(element) {
        if (element.id) {
            return `//*[@id='${element.id}']`;
        }
        const parts = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling = element.previousSibling;
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
                    index++;
                }
                sibling = sibling.previousSibling;
            }
            const part = `${element.nodeName.toLowerCase()}[${index}]`;
            parts.unshift(part);
            element = element.parentNode;
        }
        return `/${parts.join('/')}`;
    }

    function addSelectedElement(element) {
        const li = document.createElement("li");
        li.classList.add("list-group-item");

        const xpath = generateXPath(element);
        const displayText = (element.textContent.trim().slice(0, 100) || "No Text Content");

        li.textContent = `${xpath} - ${displayText}`;
        li.dataset.elementId = element.dataset.elementId;
        li.dataset.xpath = xpath;
        selectedElementsList.appendChild(li);

        li.addEventListener("click", () => {
            element.classList.remove("selected-highlight");
            const listItemToRemove = selectedElementsList.querySelector(`[data-element-id="${element.dataset.elementId}"]`);
            if (listItemToRemove) listItemToRemove.remove();
            selectedElements.delete(element);
            scrapeButton.disabled = selectedElements.size === 0;
        });
    }

    scrapeButton.addEventListener("click", async () => {
        const elementsToScrape = Array.from(selectedElements.values()).map(xpath => ({ xpath }));

        try {
            const response = await fetch("/saveXpaths", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ elements: elementsToScrape })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            if (data.success) {
                alert("Data saved successfully!");
                selectedElements.clear();
                selectedElementsList.innerHTML = '';
                scrapeButton.disabled = true;
            } else {
                alert("Failed to save data: " + data.message);
            }
        } catch (error) {
            console.error("Error saving data:", error);
            alert(`Error saving data: ${error.message}`);
        }
    });
});
