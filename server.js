const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { publishTaskToQueue } = require('./queueManager');
const pool = require('./databaseCon');

require('dotenv').config()


const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 3600000 }
}));

function ensureDirSync(dirpath) {
    if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath, { recursive: true });
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log("passing here ???????????? =====x")
        const userId = req.body.userId;
        const language = req.body.language;
        const exercise = req.body.exercise;

        const dir = path.join(__dirname, 'uploads', String(userId), language, `Exercise${exercise}`);
        
        console.log('dir:', dir);
        
        ensureDirSync(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        file.originalname = Date.now()+"-"+file.originalname
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const result = await pool.query('INSERT INTO users(username, password) VALUES($1, $2) RETURNING *', [username, hashedPassword]);
        req.session.user = result.rows[0];
        res.redirect('/');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0 && await bcrypt.compare(password, result.rows[0].password)) {
            req.session.userId = result.rows[0].id;
            res.status(200).json({ userId: result.rows[0].id });
        } else {
            res.status(401).send('Invalid credentials');
        }
    } catch (error) {
        res.status(500).send(error.message);
    }
});



app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const language = req.body.language;
        const userId = req.body.userId;
        const exercise = req.body.exercise;
        await pool.query(`
            INSERT INTO grades(user_id, grade, exercise, language)
            VALUES($1, $2, $3, $4)
            ON CONFLICT (user_id, exercise, language)
            DO NOTHING`, [userId, -1, exercise, language]);        
        const dir = path.join(__dirname, 'uploads', String(userId), language, `Exercise${exercise}`);
        const filePath = path.join(dir, req.file.originalname);

        // Publish task to RabbitMQ
        await publishTaskToQueue(filePath, language, userId, exercise);

        res.status(200).send('File uploaded and task published successfully');
    } catch (error) {
        console.error('Error uploading file and publishing task:', error);
        res.status(500).send('Internal server error');
    }
});

app.get('/grades/:userId', async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(401).json({ error: "User not logged in" });
    }

    try {
        const result = await pool.query(
            'SELECT grade, exercise, language FROM grades WHERE user_id = $1',
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Failed to fetch grades:', error);
        res.status(500).json({ error: "Failed to fetch grades" });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
