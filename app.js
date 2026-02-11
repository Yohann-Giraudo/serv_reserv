// ----------------------------------------
// Importation des modules nécessaires
// ----------------------------------------
const express = require('express');   // Framework web principal (gestion des routes et du serveur)
const app = express();
const mysql = require('mysql');       // Module de connexion MySQL
const bodyParser = require('body-parser'); // (facultatif ici, Express inclut déjà le parsing)
const port = process.env.PORT || 3000;       // Port d’écoute du serveur local
const multer = require('multer');
const path = require('path');

require('dotenv').config();

// ----------------------------------------
// Configuration des middlewares
// ----------------------------------------
app.use(express.urlencoded({ extended: true })); // Permet de lire les données envoyées depuis les formulaires
app.use(express.json());                         // Permet de lire les requêtes au format JSON (API)
app.use(express.static('public'));               // Définit le dossier "public" pour les fichiers statiques (CSS, images, JS...)

// ----------------------------------------
// Connexion à la base de données MySQL
// ----------------------------------------
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});


// Vérification de la connexion MySQL
db.connect((err) => {
  if (err) {
    console.error("Erreur de connexion à MySQL :", err);
  } else {
    console.log("Connecté à la base de données MySQL !");
  }
});

// ----------------------------------------
// Configuration du moteur de template EJS
// ----------------------------------------
app.set('view engine', 'ejs'); // Définit EJS comme moteur de rendu (permet de générer des pages HTML dynamiques)

// --- Configuration de Multer (stockage des fichiers) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Dossier de destination
    cb(null, path.join(__dirname, 'public/hotels'));
  },
  filename: (req, file, cb) => {
    // Nom temporaire par défaut (sera renommé après insertion)
    cb(null, 'temp_' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });




// ----------------------------------------
// Définition des routes principales
// ----------------------------------------

// Page d'accueil
app.get("/", (req, res) => {
  const sqlHotelsPop = `
    SELECT *
    FROM hotel
    ORDER BY etoiles DESC, prix_nuit ASC
    LIMIT 3
  `;

  const sqlHotelsOffres = `
    SELECT *
    FROM hotel
    WHERE is_promo = 1
    ORDER BY promo_percent DESC, prix_nuit ASC
    LIMIT 3
  `;

  const sqlReviews = `
    SELECT r.author, r.rating, r.comment, h.nom AS hotelName
    FROM reviews r
    JOIN hotel h ON h.id = r.hotel_id
    WHERE r.is_approved = TRUE
    ORDER BY RAND()
    LIMIT 9
  `;

  db.query(sqlHotelsPop, (err, hotels_populaires) => {
    if (err) {
      console.error("Erreur MySQL (home hotels_pop):", err);
      return res.render("home", { hotels_populaires: [], hotels_offres: [], reviews: [] });
    }

    db.query(sqlHotelsOffres, (err2, hotels_offres) => {
      if (err2) {
        console.error("Erreur MySQL (home hotels_offres):", err2);
        return res.render("home", { hotels_populaires, hotels_offres: [], reviews: [] });
      }

      db.query(sqlReviews, (err3, reviews) => {
        if (err3) {
          console.error("Erreur MySQL (home reviews):", err3);
          return res.render("home", { hotels_populaires, hotels_offres, reviews: [] });
        }

        return res.render("home", { hotels_populaires, hotels_offres, reviews });
      });
    });
  });
});

// Page de contact
app.get('/contact', (req, res) => {
  res.render('contact');
});

// Page listant les hôtels
app.get('/hotels', (req, res) => {
  const sql = "SELECT * FROM hotel";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erreur MySQL :", err);
      return res.send("Erreur lors de la récupération des hôtels.");
    }
    return res.render("hotels", { hotels: results });
  });
});


// Page "Détails hôtel"
app.get('/hotels/:id', (req, res) => {
  const hotelId = req.params.id;
  const sql = "SELECT * FROM hotel WHERE id = ?";

  db.query(sql, [hotelId], (err, results) => {
    if (err) {
      console.error("Erreur MySQL :", err);
      return res.send("Erreur serveur");
    }

    if (results.length === 0) {
      return res.send("Hôtel introuvable");
    }

    return res.render('hotel_detail', { hotel: results[0] });
  });
});


// Page "À propos"
app.get('/about_us', (req, res) => {
  res.render('about_us');
});


// ----------------------------------------
// Formulaire d'ajout d'hôtel
// ----------------------------------------

// Affichage du formulaire d'ajout
app.get("/ajouter-hotel", (req, res) => {
  res.render("ajouter_hotel");
});

// Traitement des données envoyées par le formulaire
app.post("/ajouter-hotel", upload.single('image'), (req, res) => {
  const { nom, adresse, ville, capacite_total } = req.body;

  // Insérer l'hôtel sans image au début
  const insertSql = "INSERT INTO hotel (nom, adresse, ville, capacite_total) VALUES (?, ?, ?, ?)";
  db.query(insertSql, [nom, adresse, ville, capacite_total], (err, result) => {
    if (err) {
      console.error("Erreur lors de l'ajout :", err);
      return res.render("ajouter_hotel", { message: "Erreur lors de l'ajout.", type: "danger" });
    }

    const hotelId = result.insertId; // ID auto de l'hôtel
    const extension = path.extname(req.file.originalname); // ex: .jpg ou .png
    const newImageName = `hotel_${hotelId}_1${extension}`;
    const fs = require('fs');

    // Renommer l'image uploadée avec le bon nom
    const oldPath = path.join(__dirname, 'public/hotels', req.file.filename);
    const newPath = path.join(__dirname, 'public/hotels', newImageName);

    fs.rename(oldPath, newPath, (err) => {
      if (err) console.error("Erreur de renommage :", err);

      // Mettre à jour la base de données avec le nom de l'image
      const updateSql = "UPDATE hotel SET image = ? WHERE id = ?";
      db.query(updateSql, [newImageName, hotelId], (err2) => {
        if (err2) console.error("Erreur update image :", err2);
        else console.log(`Image ${newImageName} enregistrée pour l'hôtel ${hotelId}`);

        // Message de confirmation à l'utilisateur
        res.render("ajouter_hotel", {
          message: "Hôtel et image ajoutés avec succès !",
          type: "success"
        });
      });
    });
  });
});



// ----------------------------------------
// Lancement du serveur Express
// ----------------------------------------
app.listen(port, () => {
  console.log(`Serveur lancé sur http://localhost:${port}`);
});