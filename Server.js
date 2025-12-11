// ------------------------- IMPORTS -------------------------
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;
const SALT_ROUNDS = 12;

// ------------------------- DATABASE -------------------------
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

// ------------------------- MIDDLEWARE -------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ------------------------- SCHEMAS -------------------------
const userSchema = new mongoose.Schema({
    FullName: String,
    Email: String,
    Password: String
});
const Users = mongoose.model('Users', userSchema);

const jobSchema = new mongoose.Schema({
    title: String,
    company: String,
    location: String,
    type: String,
    salary: Number,
    description: String,
    postedAt: { type: Date, default: Date.now }
});
const Jobs = mongoose.model('Jobs', jobSchema);

const applicationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Jobs" },
    appliedAt: { type: Date, default: Date.now }
});
const Applications = mongoose.model('Applications', applicationSchema);

// ------------------------- ROUTES -------------------------

// ---- Frontend pages ----
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'InternshipTrackerMainPage.html')));
app.get('/profile', (req, res) => req.session.userId ? res.sendFile(path.join(__dirname, 'public', 'profile.html')) : res.redirect('/signup'));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'CreateAccount.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Login.html')));
app.get('/jobs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'jobs.html')));
app.get('/applied', (req, res) => req.session.userId ? res.sendFile(path.join(__dirname, 'public', 'applied.html')) : res.redirect('/signup'));
app.get('/interview', (req, res) => req.session.userId ? res.sendFile(path.join(__dirname, 'public', 'interview.html')) : res.redirect('/signup'));
app.get('/offer', (req, res) => req.session.userId ? res.sendFile(path.join(__dirname, 'public', 'offer.html')) : res.redirect('/signup'));
app.get('/rejected', (req, res) => req.session.userId ? res.sendFile(path.join(__dirname, 'public', 'rejected.html')) : res.redirect('/signup'));
app.get('/notes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'notes.html')));

// ---- User Authentication ----
app.post('/post', async (req, res) => {
    const { FullName, Email, Password } = req.body;
    if (await Users.findOne({ Email })) return res.status(400).send('Email already exists.');

    const hashed = await bcrypt.hash(Password, SALT_ROUNDS);
    const user = new Users({ FullName, Email, Password: hashed });
    await user.save();

    req.session.userId = user._id;
    res.redirect('/profile');
});

app.post('/login', async (req, res) => {
    const { Email, Password } = req.body;
    const user = await Users.findOne({ Email });
    if (!user) return res.status(400).send("User not found");

    if (!(await bcrypt.compare(Password, user.Password))) return res.status(400).send("Incorrect password");

    req.session.userId = user._id;
    res.redirect('/profile');
});

// ---- Profile API ----
app.get('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await Users.findById(req.session.userId).lean();
    res.json(user);
});

app.put('/api/profile/update', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const { FullName, Email } = req.body;
    const updatedUser = await Users.findByIdAndUpdate(req.session.userId, { FullName, Email }, { new: true });
    res.json({ success: true, user: updatedUser });
});

// ---- Notes ----
let publicNotes = [];
app.post('/add-note', (req, res) => {
    const note = req.body.note;
    publicNotes.push(note);
    res.json({ success: true });
});
app.get('/get-notes', (req, res) => res.json(publicNotes));

// ---- Job Listings ----
app.get('/api/jobs/search', async (req, res) => {
    const { title, company, location, type } = req.query;
    let query = {};
    if (title) query.title = { $regex: title, $options: "i" };
    if (company) query.company = { $regex: company, $options: "i" };
    if (location) query.location = { $regex: location, $options: "i" };
    if (type) query.type = type;

    const jobs = await Jobs.find(query);
    res.json(jobs);
});

app.post('/api/jobs/apply/:jobId', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "You must be logged in." });

    const jobId = req.params.jobId;
    if (await Applications.findOne({ userId: req.session.userId, jobId })) return res.json({ message: "Already applied" });

    const application = new Applications({ userId: req.session.userId, jobId });
    await application.save();
    res.json({ success: true, application });
});

app.post('/api/jobs/create', async (req, res) => {
    const { title, company, location, type, salary, description } = req.body;
    const job = new Jobs({ title, company, location, type, salary, description });
    await job.save();
    res.json({ success: true });
});

// ---- Applied Applications ----
app.get('/api/applications', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "You must be logged in." });
    const applications = await Applications.find({ userId: req.session.userId }).populate('jobId').sort({ appliedAt: -1 });
    res.json(applications);
});

// ---- External Jobs via Adzuna ----
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || 'e4bbbaf3';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || 'c012816966637bd14bdf0f387ecb124b';

app.get('/api/jobs/external', async (req, res) => {
    try {
        const { what = '', where = 'ireland', page = 1 } = req.query;
        const apiUrl = `https://api.adzuna.com/v1/api/jobs/ie/search/${page}?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=10&what=${encodeURIComponent(what)}&where=${encodeURIComponent(where)}`;

        const response = await fetch(apiUrl);
        const data = await response.json();
        const jobs = data.results.map(job => ({
            title: job.title,
            company: job.company.display_name,
            location: job.location.display_name,
            type: job.contract_time || "N/A",
            salary: job.salary_min || null,
            description: job.description,
            redirect_url: job.redirect_url
        }));

        res.json(jobs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch external jobs" });
    }
});

// ------------------------- START SERVER -------------------------
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
