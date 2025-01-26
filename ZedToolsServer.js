const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const recordBook = {};

let collection = null;

async function initDB() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Successfully connected to MongoDB");

        const database = client.db("ZedTools");

        // await database.collection("FactionLogs").drop(); // Dangerous! Remove ALL faction logs.

        collection = database.collection("FactionLogs");
        console.log("Number of faction logs: " + (await collection.estimatedDocumentCount()));

        collection.createIndex({ timestamp: 1, userid: 1 }, { unique: true });
        collection.createIndex({ userid: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });
        collection.createIndex({ factionName: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });

        // Build initial record book
        collection.find({}).forEach(
            function (document) {
                addLogToRecordBook(document);
            },
            function (e) {}
        );
    } finally {
        // await client.close();
    }
}
initDB().catch(console.dir);

const app = express();
const port = 7000;

app.use(express.json());

app.get("/faction-item-records", async (req, res) => {
    console.log("---------- GET: " + req.originalUrl);
    const estimatedDocumentCount = await collection.estimatedDocumentCount();
    res.status(200).json({ recordBook: recordBook, estimatedDocumentCount: estimatedDocumentCount });
});

app.post("/upload-faction-logs/", async (req, res) => {
    console.log("---------- POST: " + req.originalUrl);
    const json = req.body;
    console.log("received log length: " + json.length);

    let insertedIds = {};

    try {
        const insertResult = await collection.insertMany(json, { ordered: false });
        insertedIds = insertResult?.insertedIds;
    } catch (e) {
        console.error("Caught error:" + e?.errorResponse?.message);
        insertedIds = e?.insertedIds;
    }

    console.log("inserted count: " + Object.keys(insertedIds).length);
    for (const index in insertedIds) {
        const id = insertedIds[index];
        const one = await collection.findOne({ _id: id });
        addLogToRecordBook(one);
    }

    const estimatedDocumentCount = await collection.estimatedDocumentCount();
    console.log("total number of stored faction logs: " + estimatedDocumentCount);
    res.status(200).json({ estimatedDocumentCount: estimatedDocumentCount });
});

function addLogToRecordBook(document) {
    // 物品记账
    const userId = document.userId;
    if (userId && !recordBook[userId]) {
        recordBook[userId] = {
            playerId: userId,
            playerNames: [document.userName],
            items: {},
            respectFromRaids: 0,
            lastRaid: null,
        };
    }
    if (document.logType === "faction_take_item") {
        recordBook[userId].items[document.itemName] = recordBook[userId].items[document.itemName]
            ? Number(recordBook[userId].items[document.itemName]) - Number(document.itemQty)
            : -Number(document.itemQty);
    }
    if (document.logType === "faction_add_item") {
        recordBook[userId].items[document.itemName] = recordBook[userId].items[document.itemName]
            ? Number(recordBook[userId].items[document.itemName]) + Number(document.itemQty)
            : Number(document.itemQty);
    }
}

app.listen(port, () => {
    console.log(`ZedToolsServer Express app listening on port ${port}`);
});

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
