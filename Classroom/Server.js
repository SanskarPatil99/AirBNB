const express = require("express");
const app = express();
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const flash = require("connect-flash");
const users = require("./routes/user.js");
const posts = require("./routes/posts.js");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(cookieParser());
app.use(
    session({
        secret: "mysupersecretstring",
        resave: false,
        saveUninitialized: true,
    })
);
app.use(flash());

app.get("/register", (req, res) => {
    const { name = "Anonymous" } = req.query;
    req.session.name = name;
    req.flash("Success", "User registered successfully!");
    res.redirect("/hello");
});

app.get("/hello", (req, res) => {
    res.locals.messages = req.flash("Success");
    res.render("page.ejs", { name: req.session.name });
});

app.get("/getcookies", (req, res) => {
    res.cookie("Great", "Hello");
    res.send("Sent you Some Cookies!");
});

app.get("/reqcount", (req, res) => {
    req.session.count = (req.session.count || 0) + 1;
    res.send(`You sent a request ${req.session.count} times`);
});

app.get("/test", (req, res) => {
    res.send("test Successful!!");
});

app.get("/", (req, res) => {
    res.send("Hi, I am Root!");
});

app.use("/users", users);
app.use("/posts", posts);

app.listen(3000, () => {
    console.log("Server is Listening to 3000");
});