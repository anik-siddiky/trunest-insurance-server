const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());







const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();





        const database = client.db('truNestInsurance');
        // Collections
        const policiesCollection = database.collection('policies');

        
        // Getting all the policies
        app.get('/policies', async (req, res) => {
            const policies = await policiesCollection.find().toArray();
            res.send(policies);
        });









        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);









app.get('/', (req, res) => {
    res.send('TruNest Insurance Server is running');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});