const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const path = require("path");
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080, maxPayload: 1024 * 1024 * 1024 });
const connections = new Map();

const PORT = 1337;

const app = express();

//app.use(limiter);

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files (HTML, CSS, etc.)
app.use(express.static(path.join(__dirname, "public")));

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Route to display the main HTML page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Route to scrape a URL
app.post("/loadWebsite", async (req, res) => {
    const { website } = req.body;

    if (!website) {
        return res.status(400).send("Website URL is required.");
    }

    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();
        await page.goto(website, {
            waitUntil: 'networkidle0', // Wait for initial HTML to be parsed
            timeout: 30000, // Set a timeout to prevent indefinite hanging
        });

        // Fetch full page styles and content
        const styles = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
            return links.map(link => link.href);
        });

        let content = await page.content();
        styles.forEach(style => {
            content = `<link rel="stylesheet" href="${style}">\n` + content;
        });

        // Save website content to a temporary file
        const tempFilePath = path.join(__dirname, "public", "temp.html");
        fs.writeFileSync(tempFilePath, content);

        await browser.close();
        res.json({ success: true, tempFilePath: "/temp.html" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

const dbPath = path.join(__dirname, 'scraped_data.db'); // Path to your database file
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the SQLite database.');

    // Create table if it doesn't exist
    db.run(`
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            xpath TEXT,
            link TEXT,
            textContent TEXT
        )
    `, (err) => { if (err) { return console.error(err.message); } });

    db.run(`
        CREATE TABLE IF NOT EXISTS xpaths (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            xpath TEXT
        )
    `, (err) => { if (err) { return console.error(err.message); } });

    db.run(`
        CREATE TABLE IF NOT EXISTS scraped (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link TEXT,
            data TEXT,
            date INTEGER
        )
    `, (err) => { if (err) { return console.error(err.message); } });

    db.run(`
        CREATE TABLE IF NOT EXISTS sent_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            dataId INTEGER NOT NULL,
            UNIQUE(userId, dataId)
        )
    `, (err) => { if (err) { return console.error(err.message); } });

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT UNIQUE NOT NULL
        )
    `, (err) => { if (err) { return console.error(err.message); } });

});

app.get('/getLinksTable', (req, res) => {
    db.all('SELECT * FROM links', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/getXpathsTable', (req, res) => {
    db.all('SELECT * FROM xpaths', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/getScrapedTable', (req, res) => {
    db.all('SELECT * FROM scraped', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Endpoint to reset specific tables
app.post('/reset/specific', (req, res) => {
    const queries = [
        'DELETE FROM scraped',
        'DELETE FROM sent_data',
        'DELETE FROM users'
    ];

    db.serialize(() => {
        try {
            queries.forEach((query) => db.run(query));
            res.json({ success: true, message: 'Scraped, sent_data, and users tables have been reset.' });
        } catch (error) {
            console.error("Error resetting specific tables:", error.message);
            res.status(500).json({ success: false, message: 'Failed to reset specific tables.' });
        }
    });

    connections.clear();
    sentDataTracker.clear();
});

// Endpoint to reset all tables
app.post('/reset/all', (req, res) => {
    const queries = [
        'DELETE FROM scraped',
        'DELETE FROM sent_data',
        'DELETE FROM users',
        'DELETE FROM links', // Add more table names as required
        'DELETE FROM xpaths' // Add more table names as required
    ];

    db.serialize(() => {
        try {
            queries.forEach((query) => db.run(query));
            res.json({ success: true, message: 'All tables have been reset.' });
        } catch (error) {
            console.error("Error resetting all tables:", error.message);
            res.status(500).json({ success: false, message: 'Failed to reset all tables.' });
        }
    });

    connections.clear();
    sentDataTracker.clear();
});

app.post("/extractLinks", async (req, res) => {
    const { elements, website } = req.body;

    if (!elements || !Array.isArray(elements) || !website) {
        return res.status(400).json({ success: false, message: "Invalid data received." });
    }

    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();
        await page.goto(website, { waitUntil: "networkidle0", timeout: 30000 });

        const scrapedData = [];

        for (const elementData of elements) {
                try {

                    // Convert the XPath to the new format (note the "xpath/" prefix if it starts with "/", "xpath/." prefix if it starts with "//")
                    const xpathSelector = `xpath/${elementData.xpath}`;

                    // Wait for the element to appear (using waitForSelector)
                    await page.waitForSelector(xpathSelector, { timeout: 5000 }).catch(() => {
                        console.warn(`XPath ${xpathSelector} not found on ${website} within timeout.`);
                    });

                    // Select elements using $$
                    const elementsFound = await page.$$(xpathSelector);

                    if (elementsFound.length > 0) {
                        for (const element of elementsFound) {
                            const link = await page.evaluate(el => {
                                let href = el.href;
                                if (!href) {
                                    // Try parent nodes if link is null
                                    let parent = el.parentElement;
                                    while (parent && !href) {
                                        href = parent.href;
                                        parent = parent.parentElement;
                                    }
                                }
                                return href;
                            }, element);

                            const textContent = await page.evaluate(el => {
                                let text = el.textContent?.trim();
                                if (!text) {
                                    // Traverse child nodes if text content is null
                                    text = Array.from(el.childNodes)
                                        .map(child => child.textContent?.trim())
                                        .filter(Boolean)
                                        .join(' ');
                                }
                                return text || null;
                            }, element);


                            scrapedData.push({ xpathSelector, link, textContent });
                        }
                    } else {
                        console.warn(`No elements found for XPath ${xpathSelector} on ${website}`);
                    }
                } catch (elementError) {
                    console.error(`Error scraping element with XPath ${elementData.xpath}:`, elementError);
                }
            }

        

        await browser.close();

        if (scrapedData.length > 0) {
            const placeholders = scrapedData.map(() => '(?, ?, ?)').join(',');
            const values = scrapedData.flatMap(item => [item.xpathSelector, item.link, item.textContent]);
            const sql = `INSERT INTO links (xpath, link, textContent) VALUES ${placeholders}`;

            db.run(sql, values, function (err) {
                if (err) {
                    console.error("Error inserting data:", err.message);
                    return res.status(500).json({ success: false, message: err.message });
                }
                res.json({ success: true });
            });
        } else {
            res.json({ success: true, message: "No data scraped" });
        }
    } catch (error) {
        console.error("Error scraping website:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post("/saveXpaths", async (req, res) => {
    const { elements } = req.body;
    if (!elements || !Array.isArray(elements)) {
        return res.status(400).json({ success: false, message: "Invalid data received." });
    }

    const scrapedData = [];

    for (const elementData of elements) {
        if (!elementData.xpath) continue; // Skip if selector is undefined

        scrapedData.push({ xpath: "xpath/" + elementData.xpath })
    }

    if (scrapedData.length > 0) {
        const placeholders = scrapedData.map(() => '(?)').join(',');
        const values = scrapedData.flatMap(item => [item.xpath]);
        const sql = `INSERT INTO xpaths (xpath) VALUES ${placeholders}`;

        db.run(sql, values, function (err) {
            if (err) {
                console.error("Error inserting data:", err.message);
                return res.status(500).json({ success: false, message: err.message });
            }
            console.log(`Rows inserted ${this.changes}`);
            res.json({ success: true });
        });
    } else {
        res.json({ success: true, message: "No data scraped" }); // No data to save, still a success
    }
});

// Close the database connection when the app shuts down (important!)
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Close the database connection.');
        process.exit(0);
    });
});

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

async function performScrape() {
    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        const dbAll = (sql, params) => {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        };

        const dbRun = (sql, params) => {
            return new Promise((resolve, reject) => {
                db.run(sql, params, function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this);
                    }
                });
            });
        };

        try {
            const linkRows = await dbAll('SELECT id, link, textContent FROM links', []);
            const scrapedLinks = await dbAll('SELECT link FROM scraped', []);
            const scrapedLinksSet = new Set(scrapedLinks.map(row => row.link));
            const xpathRows = await dbAll('SELECT xpath FROM xpaths', []);

            // Track newly scraped data for push notifications
            const newlyScrapedData = [];

            for (const linkRow of linkRows) {
                const { id, link, textContent } = linkRow;

                // Skip already scraped links
                if (scrapedLinksSet.has(link)) {
                    console.log(`Skipping already scraped link: ${link}`);
                    continue;
                }

                try {
                    // Update textContent in the links table
                    await page.goto(link, { waitUntil: 'networkidle0', timeout: 30000 });

                    for (const xpathRow of xpathRows) {
                        const xpathSelector = xpathRow.xpath;

                        const elementsFound = await page.$$(xpathSelector);

                        if (elementsFound.length > 0) {
                            for (const element of elementsFound) {
                                const textContent = await page.evaluate(el => {
                                    return el.textContent?.trim() || null;
                                }, element);

                                if (textContent) {
                                    await dbRun(
                                        'UPDATE links SET textContent = ? WHERE id = ? AND xpath = ?',
                                        [textContent, id, xpathSelector]
                                    );
                                }
                            }
                        } else {
                            console.warn(`No elements found for XPath ${xpathSelector} on ${link}`);
                        }
                    }

                    // Scrape data
                    const scrapedData = {};
                    for (const xpathRow of xpathRows) {
                        const xpath = xpathRow.xpath;

                        const elementsFound = await page.$$(xpath);

                        if (elementsFound.length > 0) {
                            var index = 0;
                            for (const element of elementsFound) {
                                const textContent = await page.evaluate(el => {
                                    let text = el.textContent?.trim();
                                    if (!text) {
                                        text = Array.from(el.childNodes)
                                            .map(child => child.textContent?.trim())
                                            .filter(Boolean)
                                            .join(' ');
                                    }
                                    return text || null;
                                }, element);
                                scrapedData[index] = textContent;
                                index++;
                            }
                        } else {
                            console.warn(`No elements found for XPath ${xpath} on ${link}`);
                        }
                    }

                    const dataJson = JSON.stringify(scrapedData);
                    await dbRun('INSERT INTO scraped (link, data, date) VALUES (?, ?, ?)', [link, dataJson, Date.now()]);

                    // Add to newly scraped data for notifications
                    newlyScrapedData.push({
                        title: textContent,
                        content: scrapedData,
                        link: link,
                        date: Date.now()
                    });
                    
                } catch (error) {
                    console.error(`Error scraping link ${link}:`, error.message);
                }
            }

            await browser.close();

            // Send push notifications for newly scraped data
            onNewDataScraped(newlyScrapedData);

        } catch (dbError) {
            console.error("Database error:", dbError.message);
            await browser.close();
        }
    } catch (error) {
        console.error("Error during scraping:", error);
    }
}



var scrapeInterval = null;

app.post('/startScraping', (req, res) => {
    if (scrapeInterval) {
        return res.status(400).json({ message: "Scraping is already running." });
    }

    performScrape(); // Run once immediately
    scrapeInterval = setInterval(performScrape, 60000); // Then every 60 seconds
    res.json({ message: "Scraping started." });
});

app.post('/stopScraping', (req, res) => {
    if (scrapeInterval) {
        clearInterval(scrapeInterval);
        scrapeInterval = null;
        res.json({ message: "Scraping stopped." });
    } else {
        res.status(400).json({ message: "Scraping is not running." });
    }
});

app.post('/getScrapeStatus', (req, res) => {
    if (scrapeInterval) {
        res.json({ message: "Running..." });
    } else {
        res.json({ message: "Stopped!" });
    }
});

const sentDataTracker = new Map();

// Populate the cache from the database on server launch
function populateCache() {
    db.all('SELECT userId, dataId FROM sent_data', [], (err, rows) => {
        if (err) {
            console.error("Error fetching sent data from database:", err.message);
            return;
        }
        rows.forEach(row => {
            if (!sentDataTracker.has(row.userId)) {
                sentDataTracker.set(row.userId, new Set());
            }
            sentDataTracker.get(row.userId).add(row.dataId);
        });
        console.log("Cache populated with sent data.");
        console.log(sentDataTracker);
    });
}

// Call this function when the server starts
populateCache();

app.post('/mobileData', (req, res) => {
    const { userId } = req.body; // Expect client to send their unique user ID

    console.log("Fetch request...");

    if (!userId) {
        return res.status(400).json({ success: false, message: "User ID is required." });
    }

    console.log("Fetch request from user: " + userId);

    // Get the set of sent data IDs for the user
    const alreadySent = sentDataTracker.get(userId) || new Set();

    try {
        // Query to join links and scraped tables
        const query = `
            SELECT
                scraped.id AS id,
                links.textContent AS title,
                scraped.data AS content,
                links.link AS link,
                scraped.date AS date
            FROM 
                links
            INNER JOIN 
                scraped 
            ON 
                links.link = scraped.link
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error("Error fetching data for mobile:", err.message);
                return res.status(500).json({ success: false, message: "Database query error." });
            }

            // Filter out already sent data
            const newData = rows.filter(row => !alreadySent.has(row.id));

            // Update the cache and the database with the new data
            if (newData.length > 0) {
                const placeholders = newData.map(() => '(?, ?)').join(',');
                const values = newData.flatMap(row => [userId, row.id]);
                const sql = `INSERT INTO sent_data (userId, dataId) VALUES ${placeholders}`;

                db.run(sql, values, function (err) {
                    if (err) {
                        console.error("Error updating sent data in database:", err.message);
                    }
                });

                // Update the cache
                if (!sentDataTracker.has(userId)) {
                    sentDataTracker.set(userId, new Set());
                }
                newData.forEach(row => sentDataTracker.get(userId).add(row.id));
            }

            //populateCache();

            res.json(newData); // Respond with only the new data
        });
    } catch (error) {
        console.error("Error in /mobileData route:", error.message);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

// Route to register or login a user
app.post('/registerOrLogin', (req, res) => {
    const { userId } = req.body;

    console.log("user login/register request...");

    if (!userId) {
        return res.status(400).json({ success: false, message: "User ID is required." });
    }

    // Check if the user exists
    db.get('SELECT * FROM users WHERE userId = ?', [userId], (err, row) => {
        if (err) {
            console.error("Database error:", err.message);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        if (row) {
            // User exists
            return res.json({ success: true, message: "User already registered." });
        } else {
            // Register the new user
            db.run('INSERT INTO users (userId) VALUES (?)', [userId], function (err) {
                if (err) {
                    console.error("Error registering user:", err.message);
                    return res.status(500).json({ success: false, message: "Error registering user." });
                }

                console.log(`User registered with userId: ${userId}`);
                res.json({ success: true, message: "User registered successfully." });
            });
        }
    });
});

// WebSocket Connection Handling
wss.on('connection', (ws, req) => {
    let userId;

    console.log('WS request received...');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'register') {
            userId = data.userId;
            connections.set(userId, ws);
            console.log(`User ${userId} connected`);
        }
    });

    ws.on('close', () => {
        if (userId) {
            connections.delete(userId);
            console.log(`User ${userId} disconnected`);
        }
    });
});

// Push Notification Service
function sendNotifications(notifications) {
    notifications.forEach(({ userId, title, dataId }) => {
        const ws = connections.get(userId);
        if (ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: 'notification',
                title: title,
            }));

            const insertQuery = `INSERT INTO sent_data (userId, dataId) VALUES (?, ?)`;
            db.run(insertQuery, [userId, dataId], function (err) {
                if (err) {
                    console.error("Error inserting ", err.message);
                }
            });

            console.log(`Sent new notification to user ${userId}`);

        } else {
            console.warn(`WebSocket not open for user ${userId}`);
        }
    });
}

// Scrape Listener
async function onNewDataScraped(scrapedData) {
    const query = `
        SELECT userId FROM sent_data WHERE dataId = ?
    `;

    const queryDataID = 'SELECT id FROM scraped WHERE link = ?';

    const notifications = [];

    for (const item of scrapedData) {
        try {
            const dataId = await new Promise((resolve, reject) => {
                db.get(queryDataID, [item.link], (err, row) => {
                    if (err) reject(err);
                    else resolve(row.id); // Ensure to extract the dataId from the returned row
                });
            });

            // Get all users who have already received this data
            const rows = await new Promise((resolve, reject) => {
                db.all(query, [dataId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            // Find users who haven't received this data
            const userIdsToNotify = [...connections.keys()].filter(
                (userId) => !rows.some((row) => row.userId === userId)
            );

            // Add notifications for users and mark data as sent
            for (const userId of userIdsToNotify) {
                notifications.push({
                    userId,
                    title: item.title,
                    dataId: dataId
                });

                /*
                const insertQuery = `INSERT INTO sent_data (userId, dataId) VALUES (?, ?)`;
                await new Promise((resolve, reject) => {
                    db.run(insertQuery, [userId, dataId], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                */
            }
        } catch (err) {
            console.error("Error processing scraped data:", err.message);
        }
    }

    // Send notifications after all processing is complete
    if (notifications.length > 0) {
        sendNotifications(notifications);
    }
}

async function sendPeriodicNotifications() {
    if (!scrapeInterval) {
        console.log("Scraping is not running. Skipping notification check.");
        return;
    }

    try {
        // Query to get unsent scraped data
        const query = `
            SELECT s.id, s.link, s.data, s.date, l.textContent AS title 
            FROM scraped s
            INNER JOIN links l ON s.link = l.link
            WHERE s.id NOT IN (SELECT dataId FROM sent_data)
        `;

        const scrapedData = await new Promise((resolve, reject) => {
            db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        if (scrapedData.length === 0) {
            console.log("No new data to notify users about.");
            return;
        }

        // Use the existing notification function
        await onNewDataScraped(scrapedData);
    } catch (error) {
        console.error("Error sending periodic notifications:", error.message);
    }
}

setInterval(() => {
    if (scrapeInterval) {
        sendPeriodicNotifications();
    }
}, 5000)