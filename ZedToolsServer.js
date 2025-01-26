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

async function initDB() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Successfully connected to MongoDB");

        const database = client.db("ZedTools");
        const collection = database.collection("FactionLogs");
        console.log("Number of faction logs: " + (await collection.estimatedDocumentCount()));
    } finally {
        // await client.close();
    }
}
initDB().catch(console.dir);

const app = express();
const port = 7000;

app.use(express.json());

app.get("/", (req, res) => {
    console.log("GET: " + req.originalUrl);
    res.status(200).json({ httpStatus: 200 });
});

app.post("/api/spy/upload/", async (req, res) => {
    console.log("POST: " + req.originalUrl);
    const json = req.body;
    console.log(json);
});

app.listen(port, () => {
    console.log(`ZedToolsServer Express app listening on port ${port}`);
});

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
