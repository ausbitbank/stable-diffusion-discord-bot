const express = require('express')
const router = express.Router()
const { createCanvas, loadImage } = require('canvas') // Use the canvas library for image processing

router.get('/mask', async (req, res, next) => {
    const imageUrl = req.query.imageUrl; // Get the image URL from the query parameters
    res.render('mask', { imageUrl }); // Pass the image URL to the EJS view
});

// New route to handle mask submission
router.post('/submit-mask', async (req, res) => {
    const { mask } = req.body; // Get the mask data from the request
    const img = await loadImage(mask); // Load the mask image

    // Create a new canvas to generate the black and white mask
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Draw the mask on the canvas
    ctx.drawImage(img, 0, 0);

    // Create a black and white mask
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        // Set the pixel to white if it's drawn on, otherwise black
        const alpha = data[i + 3]; // Get the alpha value
        data[i] = data[i + 1] = data[i + 2] = alpha > 0 ? 255 : 0; // Set RGB to 255 if drawn, else 0
    }

    ctx.putImageData(imageData, 0, 0);

    // Send the generated mask image back to the client or save it
    const maskImageUrl = canvas.toDataURL(); // Convert the canvas to a data URL
    res.json({ maskImageUrl }); // Send the mask image URL back to the client
});

module.exports = router
