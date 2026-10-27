const { fetchAllAliExpressProducts } = require('../services/aliexpressService');

exports.getAllAliExpressProducts = async (req, res) => {
    try {
        const products = await fetchAllAliExpressProducts();
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};