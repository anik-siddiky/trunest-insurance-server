const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);
const port = process.env.PORT || 5000;

app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://trunestinsurance.web.app',
        'https://trunest-insurance-server.vercel.app'
    ],
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());


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
        // await client.connect();

        const database = client.db('truNestInsurance');
        // Collections
        const policiesCollection = database.collection('policies');
        const usersCollection = database.collection('users');
        const blogsCollection = database.collection('blogs');
        const applicationCollection = database.collection('applications');
        const reviewCollection = database.collection('reviews')
        const newsletterCollection = database.collection('newsletter');
        const paymentHistoryCollection = database.collection('payments');
        const policyClaimCollection = database.collection('claims')


        const verifyToken = (req, res, next) => {
            const token = req?.cookies?.token;

            if (!token) {
                return res.status(401).send({ message: 'Unauthorized access' });
            }

            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized access' });
                }
                req.decoded = decoded;
                next();
            })
        };

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        };


        const verifyAgent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email };

            try {
                const user = await usersCollection.findOne(query);

                if (!user || user.role !== 'agent') {
                    return res.status(403).send({ message: 'forbidden access' });
                }

                next();
            } catch (error) {
                console.error('Error verifying agent:', error);
                return res.status(500).send({ message: 'Internal server error' });
            }
        };

        const verifyAdminOrAgent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email };

            try {
                const user = await usersCollection.findOne(query);

                if (!user || (user.role !== 'admin' && user.role !== 'agent')) {
                    return res.status(403).send({ message: 'forbidden access' });
                }

                next();
            } catch (error) {
                console.error('Error verifying admin or agent:', error);
                return res.status(500).send({ message: 'Internal server error' });
            }
        };


        const verifyCustomer = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email };

            try {
                const user = await usersCollection.findOne(query);

                if (!user || user.role !== 'customer') {
                    return res.status(403).send({ message: 'forbidden access' });
                }

                next();
            } catch (error) {
                console.error('Error verifying customer:', error);
                return res.status(500).send({ message: 'Internal server error' });
            }
        };


        app.post('/jwt', async (req, res) => {
            const userData = req.body;
            const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '1d' });

            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                maxAge: 24 * 60 * 60 * 1000
            });

            res.send({ success: true });
        });

        // Getting user role by email
        app.get('/users/:email/role', async (req, res) => {
            try {
                const email = req.params.email;

                if (!email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const user = await usersCollection.findOne({ email });

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send({ role: user.role || 'customer' });
            } catch (error) {
                console.error('Error getting user role:', error);
                res.status(500).send({ message: 'Failed to get role' });
            }
        });


        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: true,
                sameSite: 'none'
            });
            res.send({ success: true, message: 'Logged out' });
        });

        // Update claim status by ID
        app.patch('/claims/:id', verifyToken, verifyAgent, async (req, res) => {
            const id = req.params.id;
            const { claimStatus } = req.body;
            const result = await policyClaimCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { claimStatus } }
            );

            if (result.matchedCount === 0) {
                return res.status(404).send({ success: false, message: 'Claim not found' });
            }

            res.send({ success: true, message: `Claim ${claimStatus}` });
        });

        app.get('/claims/agent/:email', verifyToken, verifyAgent, async (req, res) => {
            const requestedEmail = req.params.email;
            const result = await policyClaimCollection.find({ agent: requestedEmail }).toArray();
            res.send(result);
        });


        // Posting claim req to db
        app.post('/claims', verifyToken, async (req, res) => {
            const claim = req.body;
            const result = await policyClaimCollection.insertOne(claim);
            res.status(201).send({ success: true, message: 'Claim submitted', insertedId: result.insertedId });
        });


        // Getting all the claim req
        app.get('/claims', verifyToken, async (req, res) => {
            const claims = await policyClaimCollection.find().toArray();
            res.send(claims);
        });

        // getting a single claim req
        app.get('/claims/:id', verifyToken, verifyAgent, async (req, res) => {
            const id = req.params.id;
            const claim = await policyClaimCollection.findOne({ _id: new ObjectId(id) });

            if (!claim) {
                return res.status(404).send({ success: false, message: 'Claim not found' });
            }
            res.send(claim);
        });


        app.get('/claimable-policies', verifyToken, verifyCustomer, async (req, res) => {
            const email = req.query.email;

            if (!email) {
                return res.status(400).send({ message: 'Email is required' });
            }

            try {
                const result = await applicationCollection.find({
                    'personal.email': email,
                    status: 'approved',
                    paymentStatus: 'paid',
                    policyStatus: 'active'
                }).toArray();

                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Failed to fetch claimable policies' });
            }
        });


        app.post('/confirm-payment', verifyToken, verifyCustomer, async (req, res) => {
            const { applicationId, amount, transactionId, policyTitle, userEmail } = req.body;

            try {
                await applicationCollection.updateOne(
                    { _id: new ObjectId(applicationId) },
                    {
                        $set: {
                            paymentStatus: 'paid',
                            policyStatus: 'active',
                        }
                    }
                );

                const paymentRecord = {
                    applicationId,
                    transactionId,
                    amount,
                    policyTitle,
                    userEmail,
                    paidAt: new Date(),
                };

                await paymentHistoryCollection.insertOne(paymentRecord);

                res.send({ success: true, message: 'Payment recorded successfully' });
            } catch (error) {
                console.error(error);
                res.status(500).send({ success: false, message: 'Failed to record payment' });
            }
        });

        // Getting payment data by email
        app.get('/payments', verifyToken, verifyCustomer, async (req, res) => {
            const email = req.query.email;

            if (!email) {
                return res.status(400).send({ message: 'Email is required' });
            }

            const result = await paymentHistoryCollection.find({ userEmail: email }).toArray();
            res.send(result);
        });


        // Getting a single payment data
        app.get('/payment/:id', verifyToken, verifyCustomer, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await paymentHistoryCollection.findOne(filter);
            res.send(result);
        })


        app.post('/newsletter', async (req, res) => {

            const { name, email } = req.body;

            if (!name || !email) {
                return res.status(400).json({ error: 'Name and email are required.' });
            }
            const existing = await newsletterCollection.findOne({ email });
            if (existing) {
                return res.status(409).json({ error: 'Email already subscribed.' });
            }
            const result = await newsletterCollection.insertOne({
                name,
                email,
                subscribedAt: new Date(),
            });

            res.status(201).json({ message: 'Subscription successful', insertedId: result.insertedId });
        });


        // Review related APIs
        // POST /reviews
        app.post('/reviews', verifyToken, verifyCustomer, async (req, res) => {
            const review = req.body;
            review.createdAt = new Date();
            const result = await reviewCollection.insertOne(review);
            res.status(201).send({ message: "Review submitted successfully", reviewId: result.insertedId });
        });

        // Getting all reviews
        app.get('/reviews', verifyToken, async (req, res) => {
            const reviews = await reviewCollection.find().sort({ createdAt: -1 }).toArray();
            res.send(reviews);
        });

        // Getting 5 reviews for feature
        app.get('/reviews/featured', async (req, res) => {
            try {
                const reviews = await reviewCollection
                    .find()
                    .sort({ createdAt: 1 })
                    .limit(5)
                    .toArray();

                res.send(reviews);
            } catch (error) {
                console.error('Error fetching featured reviews:', error);
                res.status(500).send({ error: 'Failed to fetch featured reviews' });
            }
        });

        // Getting a single review
        app.get('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const review = await reviewCollection.findOne({ _id: new ObjectId(id) });
            if (!review) { return res.status(404).send({ error: 'Review not found' }); }
            res.send(review);
        });


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

        // Get ALL policies without pagination
        app.get('/all-policies', verifyToken, verifyAdmin, async (req, res) => {
            const allPolicies = await policiesCollection.find().toArray();
            res.send(allPolicies);
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
        app.post('/policies', verifyToken, verifyAdmin, async (req, res) => {
            const policy = req.body;
            const result = await policiesCollection.insertOne(policy);
            res.send(result);
        });

        // Policy updating API
        app.put('/policies/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = { $set: updatedData };
            const result = await policiesCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // Updating policy purchasedCount when user apply and agent approve it
        app.patch('/policies/:id/increase', verifyToken, async (req, res) => {
            const id = req.params.id;
            const result = await policiesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $inc: { purchasedCount: 1 } }
            );
            res.send(result);
        });


        // Policy deleting API
        app.delete('/policies/:id', verifyToken, verifyAdmin, async (req, res) => {
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
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        // Getting a single user's data
        app.get('/user', verifyToken, async (req, res) => {
            const email = req.query.email;
            const user = await usersCollection.findOne(email);
            res.send(user);
        });

        // Getting first 3 agents
        app.get('/agents/first', async (req, res) => {
            const agents = await usersCollection
                .find({ role: 'agent' })
                .sort({ _id: 1 })
                .limit(4)
                .toArray();

            res.send(agents);
        });


        // Updating user's role
        app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
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

        // Updating user's data in DB when user updating their profile
        app.patch('/users/email/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const { name, photoURL } = req.body;

            const updateFields = {};
            if (name) updateFields.name = name;
            if (photoURL) updateFields.photoURL = photoURL;

            const result = await usersCollection.updateOne(
                { email },
                { $set: updateFields }
            );

            res.send({ message: "User updated", modifiedCount: result.modifiedCount });
        });



        // Deleting user's from DB
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
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
            try {
                const email = req.query.email;
                const role = req.query.role;

                let query = {};

                if (role === 'agent' && email) {
                    query = { 'author.email': email };
                }

                const blogs = await blogsCollection.find(query).sort({ createdAt: -1 }).toArray();
                res.send(blogs);
            } catch (error) {
                console.error('Error fetching blogs:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        // Posting the blog data
        app.post('/blogs', verifyToken, verifyAdminOrAgent, async (req, res) => {
            const blogData = req.body;
            const result = await blogsCollection.insertOne(blogData);
            res.send(result);
        });

        // Getting single blog data
        app.get('/blog/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await blogsCollection.findOne(filter);
            res.send(result);
        })

        // Update a blog
        app.put('/blogs/:id', verifyToken, verifyAdminOrAgent, async (req, res) => {
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

        // Blog view increment api
        app.patch('/blogs/:id/increment-view', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const update = { $inc: { viewCount: 1 } };

            const result = await blogsCollection.updateOne(filter, update);
            if (result.modifiedCount === 0) {
                return res.status(404).send({ message: 'Blog not found' });
            }
            res.send({ message: 'View count incremented' });
        });

        // Getting latest 4 blogs
        app.get('/blogs/latest', async (req, res) => {
            const latestBlogs = await blogsCollection.find({}).sort({ publishDate: -1 }).limit(4).toArray();
            res.send(latestBlogs);
        });


        // Blog deleting API
        app.delete('/blogs/:id', verifyToken, verifyAdminOrAgent, async (req, res) => {
            const id = req.params.id;
            const result = await blogsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });


        // Application related APIs
        // Saving application in the DB
        app.post('/application', verifyToken, async (req, res) => {
            const data = req.body;
            const result = await applicationCollection.insertOne(data);
            res.send(result);
        });

        // Getting all application
        app.get('/application', verifyToken, async (req, res) => {
            const { email, status } = req.query;
            const filter = {};

            if (email) {
                filter['personal.email'] = email;
            }

            if (status) {
                filter.status = status;
            }

            try {
                const result = await applicationCollection.find(filter).toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Server error' });
            }
        });


        // Getting a single application data
        app.get('/application/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await applicationCollection.findOne(filter);
            res.send(result);
        });

        // Updating application status
        app.patch('/application/:id', verifyToken, verifyAdminOrAgent, async (req, res) => {
            const id = req.params.id;
            const updates = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = { $set: updates };

            const result = await applicationCollection.updateOne(filter, updateDoc);

            res.send({ message: "Application updated", result });
        });

        // Deleting an application
        app.delete('/application/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await applicationCollection.deleteOne(filter);
            res.send(result);
        })


        app.post('/create-payment-intent', verifyToken, verifyCustomer, async (req, res) => {

            const amountInCents = req.body.amountInCents;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents,
                    currency: 'usd',
                    payment_method_types: ['card'],
                });
                res.json({ clientSecret: paymentIntent.client_secret })
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });


        // Dashboard home stats related api
        // Getting admin stats
        app.get('/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const [totalUsers, totalPolicies, totalBlogs, totalApplications, approvedApplications, totalReviews, totalClaims, approvedClaims, totalPayments, totalRevenueAgg] = await Promise.all([usersCollection.estimatedDocumentCount(), policiesCollection.estimatedDocumentCount(), blogsCollection.estimatedDocumentCount(), applicationCollection.estimatedDocumentCount(), applicationCollection.countDocuments({ status: 'approved' }), reviewCollection.estimatedDocumentCount(), policyClaimCollection.estimatedDocumentCount(), policyClaimCollection.countDocuments({ claimStatus: 'approved' }), paymentHistoryCollection.estimatedDocumentCount(), paymentHistoryCollection.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).toArray()]);

                const totalRevenue = totalRevenueAgg[0]?.total || 0;

                res.send({ totalUsers, totalPolicies, totalBlogs, totalApplications, approvedApplications, totalReviews, totalClaims, approvedClaims, totalPayments, totalRevenue });
            } catch (error) {
                res.status(500).send({ message: 'Failed to load admin stats', error });
            }
        });


        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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