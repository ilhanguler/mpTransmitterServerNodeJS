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
            hoverTarget = iframeDoc.elementFromPoint(e.clientX, e.clientY);

            if (!hoverTarget || hoverTarget === overlay || hoverTarget.tagName === 'HTML' || hoverTarget.tagName === 'BODY') {
                overlay.style.display = 'none';
                return;
            }

            const hoverRect = hoverTarget.getBoundingClientRect();

            overlay.style.display = 'block';
            overlay.style.top = `${hoverRect.top}px`;
            overlay.style.left = `${hoverRect.left}px`;
            overlay.style.width = `${hoverRect.width}px`;
            overlay.style.height = `${hoverRect.height}px`;
        });

        iframeDoc.addEventListener("click", (e) => {
            e.preventDefault();
            const target = iframeDoc.elementFromPoint(e.clientX, e.clientY);
            if (!target || target === overlay || target.tagName === 'HTML' || target.tagName === 'BODY') return;

            const xpath = generateXPath(target);
            console.log("generated xpath: " + xpath);
            if (!xpath) return; // Ensure valid XPath is generated

            if (selectedElements.has(target)) {
                target.classList.remove("selected-highlight");
                removeSelectedElement(target);
            } else {
                if (!target.dataset.elementId) target.dataset.elementId = generateUniqueId();
                target.classList.add("selected-highlight");
                selectedElements.set(target, xpath);
                addSelectedElement(target, xpath);
            }
            scrapeButton.disabled = selectedElements.size === 0;
        });
    });

    function generateUniqueId() {
        return Math.random().toString(36).substring(2, 15);
    }

    function generateXPath(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

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

    function addSelectedElement(element, xpath) {
        const li = document.createElement("li");
        li.classList.add("list-group-item");
        li.textContent = `${xpath} - ${(element.textContent.trim().slice(0, 100) || "No Text Content")}`;
        li.dataset.elementId = element.dataset.elementId;
        li.dataset.xpath = xpath;
        selectedElementsList.appendChild(li);

        li.addEventListener("click", () => {
            element.classList.remove("selected-highlight");
            removeSelectedElement(element);
        });
    }

    function removeSelectedElement(element) {
        const listItemToRemove = selectedElementsList.querySelector(`[data-element-id="${element.dataset.elementId}"]`);
        if (listItemToRemove) listItemToRemove.remove();
        selectedElements.delete(element);
        scrapeButton.disabled = selectedElements.size === 0;
    }

    scrapeButton.addEventListener("click", async () => {
        const elementsToScrape = Array.from(selectedElements.values()).map(xpath => ({ xpath }));
        console.log("elements to scrape: " + elementsToScrape);
        try {
            const response = await fetch("/extractLinks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ elements: elementsToScrape, website: websiteInput.value })
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
