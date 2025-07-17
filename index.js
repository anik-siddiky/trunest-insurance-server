const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
        const usersCollection = database.collection("users");


        // Policy Related APIs
        // Getting all the policies
        app.get('/policies', async (req, res) => {
            const { category, search, page = 1, limit = 9 } = req.query;

            const query = {};
            if (category) {
                query.category = category;
            }
            if (search) {
                query.policyTitle = { $regex: search, $options: 'i' };
            }

            const pageNum = parseInt(page, 10);
            const limitNum = parseInt(limit, 10);

            const totalPolicies = await policiesCollection.countDocuments(query);

            const policies = await policiesCollection
                .find(query)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .toArray();

            res.send({
                policies,
                totalPolicies,
            });
        });

        // Getting a single policy
        app.get('/policy/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const policy = await policiesCollection.findOne(filter);
            res.send(policy);
        });

        // Policy posting API from client
        app.post('/policies', async (req, res) => {
            const policy = req.body;
            const result = await policiesCollection.insertOne(policy);
            res.send(result);
        });

        // Policy updating API
        app.put('/policies/:id', async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = { $set: updatedData };
            const result = await policiesCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // Policy deleting API
        app.delete('/policies/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await policiesCollection.deleteOne(filter);
            res.send(result);
        });



        // Users Related APIs
        app.post('/users', async (req, res) => {
            const user = req.body;
            if (!user.email) {
                return res.status(400).send({ error: "Email is required" });
            }

            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) {
                return res.status(200).send({ message: "User already exists" });
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // Getting all the users
        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
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