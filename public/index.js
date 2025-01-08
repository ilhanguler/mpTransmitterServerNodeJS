document.addEventListener('DOMContentLoaded', () => {
    const linksTable = document.getElementById('links-table').querySelector('tbody');
    const xpathsTable = document.getElementById('xpaths-table').querySelector('tbody');
    const scrapedTable = document.getElementById('scraped-table').querySelector('tbody');

    const startButton = document.getElementById('start-scraping');
    const stopButton = document.getElementById('stop-scraping');
    const refreshButton = document.getElementById('refresh-data');
    const resetAllButton = document.getElementById('resetAll');
    const resetButton = document.getElementById('resetSpecific');

    function fetchAndDisplayData(route, table) {
        fetch(route)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                table.innerHTML = ''; // Clear existing data
                if (data && Array.isArray(data)) { // Check if data is valid array
                    data.forEach(row => {
                        const tr = table.insertRow();
                        Object.values(row).forEach(value => {
                            const td = tr.insertCell();
                            td.textContent = value === null ? "null" : value; // Handle null values
                        });
                    });
                } else {
                    console.error("Invalid data received:", data);
                    table.innerHTML = '<tr><td colspan="100%">Error loading data. Check console.</td></tr>';
                }
            })
            .catch(error => {
                console.error("Error fetching data:", error);
                table.innerHTML = '<tr><td colspan="100%">Error loading data. Check console.</td></tr>';
            });
    }

    async function fetchScrapeStatus() {
        try {
            const response = await fetch('/getScrapeStatus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            const statusElement = document.getElementById('scrapeStatus');
            statusElement.textContent = data.message; // Update the status text
        } catch (error) {
            console.error('Error fetching scrape status:', error);
            document.getElementById('scrapeStatus').textContent = 'Error fetching status';
        }
    }

    function refreshAllData() {
        fetchAndDisplayData('/getLinksTable', linksTable);
        fetchAndDisplayData('/getXpathsTable', xpathsTable);
        fetchAndDisplayData('/getScrapedTable', scrapedTable);
        fetchScrapeStatus();
    }


    startButton.addEventListener('click', () => {
        fetch('/startScraping', { method: 'POST' })
            .then(res => res.json())
            .then(data => alert(data.message));
        refreshAllData();
    });

    stopButton.addEventListener('click', () => {
        fetch('/stopScraping', { method: 'POST' })
            .then(res => res.json())
            .then(data => alert(data.message));
        refreshAllData();
    });

    refreshButton.addEventListener('click', refreshAllData);

    resetAllButton.addEventListener('click', () => {
        fetch('/reset/all', { method: 'POST' })
            .then(res => res.json())
            .then(data => alert(data.message));
        refreshAllData();
    });

    resetButton.addEventListener('click', () => {
        fetch('/reset/specific', { method: 'POST' })
            .then(res => res.json())
            .then(data => alert(data.message));
        refreshAllData();
    });

    setInterval(() => {
        fetchAndDisplayData('/getLinksTable', linksTable);
    }, 5000)

    setInterval(() => {
        fetchAndDisplayData('/getXpathsTable', xpathsTable);
    }, 5000)

    setInterval(() => {
        fetchAndDisplayData('/getScrapedTable', scrapedTable);
    }, 5000)

    setInterval(() => {
        fetchAndDisplayData('/getScrapeStatus', scrapedTable);
    }, 5000)

    refreshAllData(); // Initial load
    
    window.onload = fetchScrapeStatus;


});