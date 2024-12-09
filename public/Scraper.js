const form = document.getElementById("scraper-form");
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const website = document.getElementById("website").value;

    const response = await fetch("/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
    });

    const data = await response.json();
    const resultDiv = document.getElementById("scraped-data");

    if (data.success) {
        resultDiv.innerHTML = `
          <p><strong>HTML saved to:</strong> ${data.filePath}</p>
          <p><strong>Links extracted:</strong></p>
          <ul>${data.links.map((link) => `<li>${link}</li>`).join("")}</ul>
        `;
    } else {
        resultDiv.innerHTML = `<p style="color: red;">Error: ${data.message}</p>`;
    }
});