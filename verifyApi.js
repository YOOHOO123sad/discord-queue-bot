const express = require("express");

const app = express();
app.use(express.json());

const verifyCodes = new Map();

// สร้างโค้ดยืนยัน
function generateCode(userId) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    verifyCodes.set(code, {
        discordId: userId,
        created: Date.now()
    });

    return code;
}

// API สำหรับให้ Minecraft ส่งข้อมูลมายืนยัน
app.post("/verify", (req, res) => {

    const { code, minecraftName } = req.body;

    if (!verifyCodes.has(code)) {
        return res.json({
            success: false,
            message: "Invalid code"
        });
    }

    const data = verifyCodes.get(code);

    verifyCodes.delete(code);

    console.log(`VERIFY:${data.discordId}:${minecraftName}`);

    res.json({
        success: true,
        discordId: data.discordId
    });
});

app.listen(3000, () => {
    console.log("Verify API Started :3000");
});

module.exports = {
    generateCode,
    verifyCodes
};