const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const port = 5000
    
const app = express()
app.use(express.static('__dirname'))
app.use(express.urlencoded({ extended: true }))

mongoose.connect('mongodb://127.0.0.1:27017/login', )
const db = mongoose.connection

db.once('open', () => {
    console.log('Database connected')
})

const userSchema = new mongoose.Schema({
    Username: String,
    Password: String
})
const Users = mongoose.model('data', userSchema)

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'))
})

app.post('/post',async (req, res) => {
    const { Username, Password } = req.body
    const user = new Users({
        Username,
        Password
    })
    await user.save()
    console.log(user)
    res.send('Data received')
})

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
})