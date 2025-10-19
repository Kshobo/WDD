const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const link = require('./link')
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 12
require('dotenv').config() // To connect to the database securely

mongoose.connect(process.env.MONGO_URI); // To connect to the datbase securely 
const db = mongoose.connection
const port = 5000
const app = express()

app.use(express.static('__dirname'))
app.use(express.urlencoded({ extended: true }))


const userSchema = new mongoose.Schema({
    Username: String,
    Password: String
})
const Users = mongoose.model('Users', userSchema)

//This portion gets the home.html file and sends it to the browser
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'))
})

//This portion gets the data from the form and saves it to the database
app.post('/post',async (req, res) => {
    const { Username, Password } = req.body

    //This constraint checks if the username entered already exists
    const existingUser = await Users.findOne({ Username });
    if (existingUser) {
        return res.status(400).send('Username already exists.');
    }

    const hashed = await bcrypt.hash(Password, SALT_ROUNDS);

    const user = new Users({
        Username,
        Password: hashed
    })

    await user.save()
    console.log(user)
    res.send('Data received')
})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
})

//sMvmjvzWqoXAuGKJ