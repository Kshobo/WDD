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


const userSchema = new mongoose.Schema({
    FullName: String,
    Email: String,
    Password: String
})
const Users = mongoose.model('Users', userSchema)

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

app.get('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await Users.findById(req.session.userId).lean();
    res.json(user);
});

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



app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
})

//sMvmjvzWqoXAuGKJ