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

let logsCollection = null;

async function initDB() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Successfully connected to MongoDB");

        const database = client.db("ZedTools");

        // Dangerous! Remove ALL data.
        // await database.collection("FactionLogs").drop(); // Dangerous!
        // await database.collection("FactionItemBook").drop(); // Dangerous!

        logsCollection = database.collection("FactionLogs");
        console.log("Number of faction logs: " + (await logsCollection.estimatedDocumentCount()));
        logsCollection.createIndex({ timestamp: 1, userid: 1 }, { unique: true });
        logsCollection.createIndex({ userid: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });
        logsCollection.createIndex({ factionName: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });

        bookCollection = database.collection("FactionItemBook");
        console.log("Number of users in item book: " + (await bookCollection.estimatedDocumentCount()));
        bookCollection.createIndex({ playerName: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });
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
    const estimatedDocumentCount = await logsCollection.estimatedDocumentCount();

    const resultObj = {};
    for (const d of await bookCollection.find().toArray()) {
        resultObj[d.playerId] = d;
    }

    res.status(200).json({ recordBook: resultObj, estimatedDocumentCount: estimatedDocumentCount });
});

app.post("/upload-faction-logs/", async (req, res) => {
    console.log("---------- POST: " + req.originalUrl);
    const json = req.body;
    console.log("received log length: " + json.length);

    let insertedIds = {};

    try {
        const insertResult = await logsCollection.insertMany(json, { ordered: false });
        insertedIds = insertResult?.insertedIds;
    } catch (e) {
        console.error("Caught error:" + e?.errorResponse?.message);
        insertedIds = e?.insertedIds;
    }

    console.log("inserted count: " + Object.keys(insertedIds).length);
    for (const index in insertedIds) {
        const id = insertedIds[index];
        const newlyAddedLog = await logsCollection.findOne({ _id: id });
        await addLogToRecordBook(newlyAddedLog);
    }

    const estimatedDocumentCount = await logsCollection.estimatedDocumentCount();
    console.log("total number of stored faction logs: " + estimatedDocumentCount);
    res.status(200).json({ estimatedDocumentCount: estimatedDocumentCount });
});

async function addLogToRecordBook(document) {
    // 物品记账
    const playerId = document.userId;
    let bookDocument = await bookCollection.findOne({ playerId: playerId });
    if (!bookDocument) {
        try {
            await bookCollection.insertOne({ playerId: playerId, playerNames: [document.userName], items: {}, balance: 0 });
            bookDocument = await bookCollection.findOne({ playerId: playerId });
        } catch (e) {
            console.error("Caught error:" + e?.errorResponse?.message);
        }
    }

    if (document.logType === "faction_take_item") {
        bookDocument.items[document.itemName] = bookDocument.items[document.itemName]
            ? Number(bookDocument.items[document.itemName]) - Number(document.itemQty)
            : -Number(document.itemQty);
        bookDocument.balance -= Number(document.itemQty) * getWorthPrice(document.itemName);
    }
    if (document.logType === "faction_add_item") {
        bookDocument.items[document.itemName] = bookDocument.items[document.itemName]
            ? Number(bookDocument.items[document.itemName]) + Number(document.itemQty)
            : Number(document.itemQty);
        bookDocument.balance += Number(document.itemQty) * getWorthPrice(document.itemName);
    }

    try {
        await bookCollection.replaceOne({ playerId: playerId }, bookDocument);
    } catch (e) {
        console.log(e);
        console.error("Caught error:" + e?.errorResponse?.message);
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

// 物品价值表
function getWorthPrice(itemName) {
    const itemWorthList = {
        Logs: 7,
        Coal: 25,
        "Gun Powder": 50,
        Scrap: 8,
        "Iron Bar": 105,
        Nails: 12,
        Steel: 241,
        Wire: 2500,
        Rope: 6000,
        Plastic: 4000,
        Tarp: 6000,
        Fuel: 3000,
        Water: 100,
        "Barley Seeds": 100,
        Gears: 4000,
        "Cooked Fish": 175,
        Beer: 300,
        "e-Cola": 4000,
        炸药: 20000,
        "Pistol Ammo": 300,
        "Silver key": 10000,
        "Advanced Tools": 50000,
        Pickaxe: 2170,
        "Wooden Fishing Rod": 2800,
        "Zed Pack": 50000,
        Chocolate: 800,
        "Zed Juice": 50,
        ZedBull: 6000,
        "Unrefined Plastic": 30000,
        Thread: 1500,
    };

    if (itemWorthList.hasOwnProperty(itemName)) {
        return itemWorthList[itemName];
    } else {
        console.log("getWorthPrice can not find " + itemName);
        return 0;
    }
}
