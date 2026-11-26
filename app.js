const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listings.js");
const Review = require("./models/review.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const flash = require("connect-flash");
const { listingSchema } = require("./schema.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

// ===============================
// MongoDB Connection
// ===============================
main()
    .then(() => console.log("Connected to DB"))
    .catch((err) => console.log(err));

async function main() {
    await mongoose.connect(MONGO_URL);
}

// ===============================
// Helpers
// ===============================
class ExpressError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function wrapAsync(fn) {
    return function (req, res, next) {
        fn(req, res, next).catch(next);
    };
}

function validateListing(req, res, next) {
    const { error } = listingSchema.validate(req.body);
    if (error) {
        const msg = error.details.map((el) => el.message).join(", ");
        throw new ExpressError(400, msg);
    }
    next();
}

// Flash helpers: build Bootstrap alert HTML (messages are escaped)
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildAlerts(messages, type) {
    return messages
        .map(
            (msg) => `
<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${escapeHtml(msg)}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
</div>`
        )
        .join("");
}

// ===============================
// EJS Setup
// ===============================
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "/public")));

// ===============================
// Middleware (order matters: session -> flash -> locals -> routes)
// ===============================
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

const sessionOptions = {
    secret: "mysupersecretcode",
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};

app.use(session(sessionOptions));
app.use(flash());

// Makes `flashHtml` available in every EJS file
app.use((req, res, next) => {
    res.locals.flashHtml =
        buildAlerts(req.flash("success"), "success") +
        buildAlerts(req.flash("error"), "danger");
    next();
});

// ===============================
// Routes
// ===============================
app.get("/", (req, res) => {
    res.send("Hi, I am Root");
});

// ---------- Listings ----------
app.get("/listings", wrapAsync(async (req, res) => {
    const allListings = await Listing.find({});
    res.render("listings/index.ejs", { allListings });
}));

app.get("/listings/new", (req, res) => {
    res.render("listings/new.ejs");
});

app.post("/listings", validateListing, wrapAsync(async (req, res) => {
    const listing = new Listing(req.body.listing);
    await listing.save();
    req.flash("success", "New listing created!");
    res.redirect("/listings");
}));

app.get("/listings/:id", wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("reviews");
    if (!listing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }
    res.render("listings/show.ejs", { listing });
}));

app.get("/listings/:id/edit", wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }
    res.render("listings/edit.ejs", { listing });
}));

app.put("/listings/:id", validateListing, wrapAsync(async (req, res) => {
    const { id } = req.params;
    const updated = await Listing.findByIdAndUpdate(
        id,
        req.body.listing,
        { new: true, runValidators: true }
    );
    if (!updated) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }
    req.flash("success", "Listing updated!");
    res.redirect(`/listings/${id}`);
}));

app.delete("/listings/:id", wrapAsync(async (req, res) => {
    await Listing.findByIdAndDelete(req.params.id);
    req.flash("success", "Listing deleted!");
    res.redirect("/listings");
}));

// ---------- Reviews ----------
app.post("/listings/:id/reviews", wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }

    const newReview = new Review(req.body.review);
    listing.reviews.push(newReview);

    await newReview.save();
    await listing.save();

    req.flash("success", "New review added!");
    res.redirect(`/listings/${listing._id}`);
}));

app.delete("/listings/:id/reviews/:reviewId", wrapAsync(async (req, res) => {
    const { id, reviewId } = req.params;

    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);

    req.flash("success", "Review deleted!");
    res.redirect(`/listings/${id}`);
}));

// ---------- Test ----------
app.get("/testlisting", wrapAsync(async (req, res) => {
    const sampleListing = new Listing({
        title: "My New Villa",
        description: "By the beach",
        image: {
            filename: "testimage",
            url: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=800&q=60"
        },
        price: 1200,
        location: "Baga, Goa",
        country: "India"
    });
    await sampleListing.save();
    res.send("Successful testing");
}));

// ===============================
// 404 for unknown routes
// ===============================
app.use((req, res, next) => {
    next(new ExpressError(404, "Page not found."));
});

// ===============================
// ERROR HANDLER
// ===============================
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    let status = err.status || 500;
    let message = err.message || "Something went wrong.";

    if (err.name === "ValidationError") {
        status = 400;
        message = Object.values(err.errors).map((e) => e.message).join(", ");
    }

    if (err.name === "CastError") {
        status = 400;
        message = `Invalid value for "${err.path}".`;
    }

    res.status(status).render("error.ejs", { status, message });
});

app.listen(8080, () => {
    console.log("Server is Listening to 8080");
});