const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const link = require('./link')
const session = require('express-session');
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 12
require('dotenv').config() // To connect to the database securely

mongoose.connect(process.env.MONGO_URI); // To connect to the datbase securely 
const db = mongoose.connection
const port = 5000
const app = express()


app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true }))
app.use(session({
  secret: 'your_secret_key', 
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true only for HTTPS
}));
app.use(express.json());


// Creating the User schema for the database
const userSchema = new mongoose.Schema({
    FullName: String,
    Email: String,
    Password: String
})
const Users = mongoose.model('Users', userSchema)


// Creating the Job schema for the database
const jobSchema = new mongoose.Schema({
    title: String,
    company: String,
    location: String,
    type: String,          // e.g. "Full-time", "Part-time"
    salary: Number,
    description: String,
    postedAt: { type: Date, default: Date.now }
});
const Jobs = mongoose.model('Jobs', jobSchema);


//This portion gets the InternshipTrackerMainPage.html file and sends it to the browser
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'InternshipTrackerMainPage.html'))
})

//This portion gets the data from the form and saves it to the database
app.post('/post', async (req, res) => {
    const { FullName, Email, Password } = req.body;

    const existingUser = await Users.findOne({ Email });
    if (existingUser) {
        return res.status(400).send('Email already exists.');
    }

    const hashed = await bcrypt.hash(Password, SALT_ROUNDS);

    const user = new Users({
        FullName,
        Email,
        Password: hashed
    });
    await user.save();

    // Log in the user
    req.session.userId = user._id;

    // Redirect to profile page
    res.redirect('/profile');
});

app.get('/profile', async (req, res) => {
    if (!req.session.userId) {
        // User not logged in → redirect to sign-up page
        return res.redirect('/signup');
    }

    // User is logged in → show profile info
    const user = await Users.findById(req.session.userId);
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));

});



// ---------------------------- Application Status Pages ----------------------------




app.get('/Offer', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/signup'); // or '/login' if you have one
    }
    res.sendFile(path.join(__dirname, 'public', 'offer.html'));
});

app.get('/Rejected', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/signup'); // or '/login' if you have one
    }
    res.sendFile(path.join(__dirname, 'public', 'rejected.html'));
});

app.get('/Interview', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/signup'); // or '/login' if you have one
    }
    res.sendFile(path.join(__dirname, 'public', 'interview.html'));
});

app.get('/Applied', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/signup'); // or '/login' if you have one
    }
    res.sendFile(path.join(__dirname, 'public', 'applied.html'));
});


app.get('/Notes', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'notes.html'));
})


app.get('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await Users.findById(req.session.userId).lean();
    res.json(user);
});



// ---------------------------- Profile Log Out,Update and Delete Section ----------------------------



app.put('/api/profile/update', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const { FullName, Email } = req.body;

    const updatedUser = await Users.findByIdAndUpdate(
        req.session.userId,
        { FullName, Email },
        { new: true } // returns updated document
    );

    res.json({ success: true, user: updatedUser });
});

app.delete('/api/profile/delete', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await Users.findByIdAndDelete(req.session.userId);

    // Destroy session
    req.session.destroy(err => {
      if (err) console.error(err);
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to delete account" });
  }
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'CreateAccount.html'));
});

app.post('/login', async (req, res) => {
    const { Email, Password } = req.body;

    // Check if user exists
    const user = await Users.findOne({ Email });
    if (!user) {
        return res.status(400).send("User not found");
    }

    // Compare password
    const validPass = await bcrypt.compare(Password, user.Password);
    if (!validPass) {
        return res.status(400).send("Incorrect password");
    }

    // Save session
    req.session.userId = user._id;

    // Redirect to profile
    res.redirect('/profile');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Login.html'));
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      return res.status(500).send("Failed to log out.");
    }
    res.clearCookie('connect.sid'); // optional, clears session cookie
    res.redirect('/login'); // redirect to login page
  });
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
})

let publicNotes = [];

app.post('/add-note', (req, res) => {
    const note = req.body.note;
    publicNotes.push(note);
    res.json({ success: true });
});

app.get('/get-notes', (req, res) => {
    res.json(publicNotes);
});




// ---------------------------- Applied Page Section ----------------------------




app.get('/api/applications', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "You must be logged in." });
  }

  try {
    // Find all applications by this user and populate job details
    const applications = await Applications.find({ userId: req.session.userId })
      .populate('jobId')  // fetch job details
      .sort({ appliedAt: -1 });

    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});




// ---------------------------- Job Listings Section ----------------------------




app.get('/jobs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'jobs.html'));
});

// Getting the job listings based on search criteria

const applicationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Jobs" },
    appliedAt: { type: Date, default: Date.now }
});
const Applications = mongoose.model('Applications', applicationSchema);


// ---- UPDATED SEARCH ROUTE TO INCLUDE SALARY FILTER ----
app.get('/api/jobs/search', async (req, res) => {
    try {
        const { title, company, location, type, minSalary, maxSalary } = req.query;
        let query = {};

        if (title) query.title = { $regex: title, $options: "i" };
        if (company) query.company = { $regex: company, $options: "i" };
        if (location) query.location = { $regex: location, $options: "i" };
        if (type) query.type = type;

        // Salary filter
        if (minSalary || maxSalary) {
            query.salary = {};
            if (minSalary) query.salary.$gte = Number(minSalary);
            if (maxSalary) query.salary.$lte = Number(maxSalary);
        }

        console.log("Search query:", query); // Debugging
        const jobs = await Jobs.find(query);
        res.json(jobs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Search failed" });
    }
});




app.post('/api/jobs/apply/:jobId', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "You must be logged in." });
    }

    const jobId = req.params.jobId;

    // Prevent duplicate applications
    const exists = await Applications.findOne({
        userId: req.session.userId,
        jobId
    });

    if (exists) {
        return res.json({ message: "Already applied" });
    }

    const application = new Applications({
        userId: req.session.userId,
        jobId
    });

    await application.save();
    res.json({ success: true, application });
});

// Creating a new job listing in the database
app.post('/api/jobs/create', async (req, res) => {
    const job = new Jobs({
        title: req.body.title,
        company: req.body.company,
        location: req.body.location,
        type: req.body.type,
        salary: req.body.salary,
        description: req.body.description
    });

    await job.save();
    res.json({ success: true });
});
