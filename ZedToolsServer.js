const e = require("express");
const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = "";
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

let logsCollection = null;
let bookCollection = null;
let itemWorthsCollection = null;

async function initDB() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Successfully connected to MongoDB");
        const database = client.db("ZedTools");

        logsCollection = database.collection("FactionLogs");
        console.log("Number of faction logs: " + (await logsCollection.estimatedDocumentCount()));
        logsCollection.createIndex({ timestamp: 1, userId: 1 }, { unique: true });
        logsCollection.createIndex({ userId: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });
        logsCollection.createIndex({ factionName: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });
        logsCollection.createIndex({ userName: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });
        logsCollection.createIndex({ isAccounted: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });

        bookCollection = database.collection("FactionItemBook");
        console.log("Number of users in item book: " + (await bookCollection.estimatedDocumentCount()));
        bookCollection.createIndex({ playerName: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });
        bookCollection.createIndex({ playerId: 1 }, function (err, result) {
            console.log(result);
            callback(result);
        });

        itemWorthsCollection = database.collection("ItemWorths");
        console.log("Number of items in itemWorthsCollection: " + (await itemWorthsCollection.estimatedDocumentCount()));
        itemWorthsCollection.createIndex({ itemName: 1 }, { unique: true });

        await accountLogs();
    } finally {
    }
}
initDB().catch(console.dir);

const app = express();
const port = 7000;

app.use(express.json());

app.get("/faction-item-records", async (req, res) => {
    console.log("---------- GET: " + req.originalUrl);
    const estimatedDocumentCount = await logsCollection.estimatedDocumentCount();

    await accountLogs();

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

// 物品记账
async function addLogToRecordBook(document) {
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
        bookDocument.balance -= Number(document.itemQty) * (await getWorthPrice(document.itemName));
    }
    if (document.logType === "faction_add_item") {
        bookDocument.items[document.itemName] = bookDocument.items[document.itemName]
            ? Number(bookDocument.items[document.itemName]) + Number(document.itemQty)
            : Number(document.itemQty);
        bookDocument.balance += Number(document.itemQty) * (await getWorthPrice(document.itemName));
    }

    document.isAccounted = true;

    try {
        await bookCollection.replaceOne({ _id: bookDocument._id }, bookDocument);
        await logsCollection.replaceOne({ _id: document._id }, document);
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

// 查询物品价值表
async function getWorthPrice(itemName) {
    const itemWorthDocument = await itemWorthsCollection.findOne({ itemName: itemName });
    if (itemWorthDocument) {
        return Number(itemWorthDocument.price);
    } else {
        console.log("getWorthPrice can not find " + itemName);
        return 0;
    }
}

// 将数据库中未记账的log记账
async function accountLogs() {
    let accountedNum = 0;
    const cursor = await logsCollection.find({ isAccounted: { $in: [null, false] } });
    const array = await cursor.toArray();
    for (const document of array) {
        try {
            await addLogToRecordBook(document);
            accountedNum += 1;
        } catch (e) {
            console.error(e);
        }
    }
    if (accountedNum > 0) {
        console.log("Accounted previously unaccounted logs: " + accountedNum);
    }
}
