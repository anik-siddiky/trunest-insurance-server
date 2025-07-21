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
        const usersCollection = database.collection('users');
        const blogsCollection = database.collection('blogs');


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

        // Top 6 purchased insurance policies
        app.get('/policies/top-purchased', async (req, res) => {
            try {
                const topPolicies = await policiesCollection
                    .find()
                    .sort({ purchasedCount: -1 })
                    .limit(6)
                    .toArray();

                res.send(topPolicies);
            } catch (error) {
                res.status(500).send({ error: "Failed to fetch top policies" });
            }
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
        // Saving all the user data to the DB
        app.post('/users', async (req, res) => {
            const user = req.body;
            if (!user.email) {
                return res.status(400).send({ error: "Email is required" });
            }

            const existingUser = await usersCollection.findOne({ email: user.email });

            if (existingUser) {
                const result = await usersCollection.updateOne(
                    { email: user.email },
                    { $set: { lastLogin: new Date().toISOString() } }
                );
                return res.status(200).send({ message: "Last login updated", updated: result.modifiedCount });
            }

            const result = await usersCollection.insertOne(user);
            res.send({ message: "User created", insertedId: result.insertedId });
        });

        // Getting all the users
        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        // Getting a single user's data
        app.get('/user', async (req, res) => {
            const email = req.query.email;
            const user = await usersCollection.findOne(email);
            res.send(user);
        });

        // Updating user's role
        app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;

            if (!role) {
                return res.status(400).send({ error: "Role is required" });
            }

            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ error: "User not found or role unchanged" });
                }

                res.send({ message: "User role updated", modifiedCount: result.modifiedCount });
            } catch (error) {
                res.status(500).send({ error: "Failed to update user role" });
            }
        });


        // Deleting user's from DB
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;

            try {
                const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ error: "User not found" });
                }

                res.send({ message: "User deleted successfully" });
            } catch (error) {
                res.status(500).send({ error: "Failed to delete user" });
            }
        });


        // Blogs related APIs
        // Getting all blogs
        app.get('/blogs', async (req, res) => {
            const blogs = await blogsCollection.find().sort({ createdAt: -1 }).toArray();
            res.send(blogs);
        });

        // Posting the blog data
        app.post('/blogs', async (req, res) => {
            const blogData = req.body;
            const result = await blogsCollection.insertOne(blogData);
            res.send(result);
        });


        // Update a blog
        app.put('/blogs/:id', async (req, res) => {
            const id = req.params.id;
            const updatedBlog = req.body;

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    title: updatedBlog.title,
                    content: updatedBlog.content,
                    image: updatedBlog.image,
                },
            };

            const result = await blogsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // Blog deleting API
        app.delete('/blogs/:id', async (req, res) => {
            const id = req.params.id;
            const result = await blogsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
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