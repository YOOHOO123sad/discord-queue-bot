const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const { generateCode } = require("./verifyApi");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let channelStates = new Map();
let verifiedUsers = new Map();
let pendingTierPick = new Map();
let channelModes = new Map();
let testCooldowns = new Map();
let playerMessages = new Map();

const maxQueue = 20;
const testerRoleName = "Tester";
const adminRoleName = "Admin";
const resultsChannelName = "🥇test-result";
const playerInfoChannelName = "ข้อมูลผู้เล่น";
const tierOptions = ["HT1", "LT1", "HT2", "LT2", "HT3", "LT3", "HT4", "LT4", "HT5", "LT5"];
const modeOptions = ["CPVP", "SPVP", "MACEPVP", "AXEPVP", "UHC", "MACEROCKET", "SMP", "DIAPOT", "NETHPOT"];
const cooldownDays = 3;
const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

function getState(channelId) {
    if (!channelStates.has(channelId)) {
        channelStates.set(channelId, { queue: [], onlineTesters: new Set(), currentTesting: null, lastFinished: null });
    }
    return channelStates.get(channelId);
}

function getStateByRoom(roomChannelId) {
    for (const [chId, state] of channelStates.entries()) {
        if (state.currentTesting && state.currentTesting.channelId === roomChannelId) {
            return { queueChannelId: chId, state: state };
        }
    }
    return null;
}

function loadVerifiedUsers() {
    if (fs.existsSync("verified.json")) {
        const data = JSON.parse(fs.readFileSync("verified.json", "utf8"));
        verifiedUsers = new Map(Object.entries(data));
    }
}

function saveVerifiedUsers() {
    const obj = Object.fromEntries(verifiedUsers);
    fs.writeFileSync("verified.json", JSON.stringify(obj, null, 2));
}

function loadChannelModes() {
    if (fs.existsSync("channelModes.json")) {
        const data = JSON.parse(fs.readFileSync("channelModes.json", "utf8"));
        channelModes = new Map(Object.entries(data));
    }
}

function saveChannelModes() {
    const obj = Object.fromEntries(channelModes);
    fs.writeFileSync("channelModes.json", JSON.stringify(obj, null, 2));
}

function loadCooldowns() {
    if (fs.existsSync("cooldowns.json")) {
        const data = JSON.parse(fs.readFileSync("cooldowns.json", "utf8"));
        testCooldowns = new Map(Object.entries(data));
    }
}

function saveCooldowns() {
    const obj = Object.fromEntries(testCooldowns);
    fs.writeFileSync("cooldowns.json", JSON.stringify(obj, null, 2));
}

function loadPlayerMessages() {
    if (fs.existsSync("playerMessages.json")) {
        const data = JSON.parse(fs.readFileSync("playerMessages.json", "utf8"));
        playerMessages = new Map(Object.entries(data));
    }
}

function savePlayerMessages() {
    const obj = Object.fromEntries(playerMessages);
    fs.writeFileSync("playerMessages.json", JSON.stringify(obj, null, 2));
}

function formatRemaining(ms) {
    const totalMinutes = Math.ceil(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return days + " วัน " + hours + " ชั่วโมง " + minutes + " นาที";
}

loadVerifiedUsers();
loadChannelModes();
loadCooldowns();
loadPlayerMessages();

function buildVerifyEmbed() {
    return new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("ยืนยันตัวตน")
        .setDescription("กดปุ่มด้านล่างเพื่อยืนยันตัวตนก่อนจองคิวทดสอบ\nยืนยันครั้งเดียวเท่านั้น ไม่ต้องยืนยันซ้ำ");
}

function buildVerifyButton() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_identity")
            .setLabel("ยืนยันตัวตน")
            .setStyle(ButtonStyle.Primary)
    );
}

function buildEmbed(channelId) {
    const state = getState(channelId);
    const mode = channelModes.get(channelId);

    const testerText = state.onlineTesters.size > 0
        ? Array.from(state.onlineTesters).map((id) => "<@" + id + ">").join(", ")
        : "ไม่มี";
    const queueText = state.queue.length === 0
        ? "ไม่มีคน"
        : state.queue.map((item, i) => (i + 1) + ". <@" + item.userId + "> — " + item.detail).join("\n");
    const testingText = state.currentTesting
        ? "<@" + state.currentTesting.userId + "> — " + state.currentTesting.detail + (state.currentTesting.channelId ? "\nห้อง: <#" + state.currentTesting.channelId + ">" : "")
        : "ไม่มีใครกำลังทดสอบ";
    const finishedText = state.lastFinished
        ? "<@" + state.lastFinished + ">"
        : "ยังไม่มี";

    const embedColor = state.currentTesting ? 0x00FF00 : 0xFF0000;

    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(mode ? "PVP — " + mode : "PVP")
        .addFields(
            { name: "Tester ออนไลน์ (" + state.onlineTesters.size + ")", value: testerText },
            { name: "เทสเสร็จแล้ว", value: finishedText },
            { name: "กำลังทดสอบ", value: testingText },
            { name: "คิว (" + state.queue.length + "/" + maxQueue + ")", value: queueText },
        );
}

function buildButtons(channelId) {
    const state = getState(channelId);
    const queueDisabled = state.onlineTesters.size === 0 || state.queue.length >= maxQueue;
    const nextDisabled = state.queue.length === 0 || state.currentTesting !== null;
    const doneDisabled = state.currentTesting === null;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("join_queue")
            .setLabel(queueDisabled ? "ปิดรับคิว" : "จองคิว")
            .setStyle(ButtonStyle.Success)
            .setDisabled(queueDisabled),
        new ButtonBuilder()
            .setCustomId("cancel_queue")
            .setLabel("ยกเลิกคิว")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("toggle_duty")
            .setLabel("เข้าเวร / ออกเวร")
            .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("call_next")
            .setLabel("เรียกคิวถัดไป")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(nextDisabled),
        new ButtonBuilder()
            .setCustomId("finish_testing")
            .setLabel("เทสเสร็จแล้ว")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(doneDisabled)
    );

    return [row1, row2];
}

async function getOrCreateResultsChannel(guild) {
    const channel = guild.channels.cache.find((c) => c.name === resultsChannelName);
    return channel || null;
}

async function createTestRoom(guild, testerId, queueItem, parentChannel) {
    const channelName = "test-" + queueItem.userId;

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentChannel ? parentChannel.parentId : null,
        position: 0,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: testerId,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            },
            {
                id: queueItem.userId,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            },
            {
                id: client.user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels],
            },
        ],
    });

    const verifyInfo = verifiedUsers.get(queueItem.userId);

    const infoEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle("ห้องทดสอบ")
        .addFields(
            { name: "ผู้เทส", value: "<@" + testerId + ">" },
            { name: "คนที่มาเทส", value: "<@" + queueItem.userId + ">" },
            { name: "ชื่อในเกม", value: verifyInfo ? verifyInfo.gameName : "ไม่มีข้อมูล" },
            { name: "โหมด", value: queueItem.mode || "ไม่ระบุ" },
        );

    if (verifyInfo && verifyInfo.imageUrl) {
        infoEmbed.setImage(verifyInfo.imageUrl);
    }

    const tierButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("give_tier")
            .setLabel("ให้ Tier")
            .setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [infoEmbed], components: [tierButton] });

    return channel;
}

client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
        const member = interaction.member;
        const isTester = member.roles.cache.some((role) => role.name === testerRoleName);

        if (interaction.customId === "verify_identity") {
     
    if (verifiedUsers.has(interaction.user.id)) {
        await interaction.reply({
            content: "คุณยืนยันตัวตนแล้ว",
            ephemeral: true
        });
        return;
    }

    const code = generateCode(interaction.user.id);

    await interaction.reply({
        content: `โค้ดของคุณคือ

${code}

นำไปพิมพ์ใน Minecraft

/verify ${code}`,
        ephemeral: true
    });

    return;
}
        if (interaction.customId === "join_queue") {
            const state = getState(interaction.channelId);

            loadVerifiedUsers();

if (!verifiedUsers.has(interaction.user.id)) {
    await interaction.reply({
        content: "คุณต้องยืนยันตัวตนก่อน",
        ephemeral: true
    });
    return;
}

            const lastTested = testCooldowns.get(interaction.user.id);
            if (lastTested) {
                const elapsed = Date.now() - lastTested;
                if (elapsed < cooldownMs) {
                    const remaining = cooldownMs - elapsed;
                    await interaction.reply({ content: "คุณเทสไปแล้ว ต้องรออีก " + formatRemaining(remaining) + " ถึงจะจองคิวได้ใหม่", ephemeral: true });
                    return;
                }
            }

            const alreadyInQueue = state.queue.some((item) => item.userId === interaction.user.id);
            if (alreadyInQueue) {
                await interaction.reply({ content: "คุณอยู่ในคิวอยู่แล้ว", ephemeral: true });
                return;
            }

            if (state.queue.length >= maxQueue) {
                await interaction.reply({ content: "คิวเต็มแล้ว", ephemeral: true });
                return;
            }

            const mode = channelModes.get(interaction.channelId);
            state.queue.push({ userId: interaction.user.id, detail: "รอทดสอบ", mode: mode });

            await interaction.update({ embeds: [buildEmbed(interaction.channelId)], components: buildButtons(interaction.channelId) });
            return;
        }

        if (interaction.customId === "cancel_queue") {
            const state = getState(interaction.channelId);
            const index = state.queue.findIndex((item) => item.userId === interaction.user.id);

            if (state.currentTesting && interaction.user.id === state.currentTesting.userId) {
                await interaction.reply({ content: "คุณกำลังทดสอบอยู่ ไม่สามารถยกเลิกได้ตรงนี้", ephemeral: true });
                return;
            }

            if (index === -1) {
                await interaction.reply({ content: "คุณไม่ได้อยู่ในคิว", ephemeral: true });
                return;
            }

            state.queue.splice(index, 1);

            await interaction.update({ embeds: [buildEmbed(interaction.channelId)], components: buildButtons(interaction.channelId) });
            return;
        }

        if (interaction.customId === "toggle_duty") {
            if (!isTester) {
                await interaction.reply({ content: "คุณไม่มีสิทธิ์เป็น Tester", ephemeral: true });
                return;
            }

            const state = getState(interaction.channelId);

            if (state.onlineTesters.has(interaction.user.id)) {
                state.onlineTesters.delete(interaction.user.id);
            } else {
                state.onlineTesters.add(interaction.user.id);
            }

            await interaction.update({ embeds: [buildEmbed(interaction.channelId)], components: buildButtons(interaction.channelId) });
            return;
        }

        if (interaction.customId === "call_next") {
            if (!isTester) {
                await interaction.reply({ content: "คุณไม่มีสิทธิ์เป็น Tester", ephemeral: true });
                return;
            }

            const state = getState(interaction.channelId);

            if (state.currentTesting !== null) {
                await interaction.reply({ content: "ยังมีคนกำลังทดสอบอยู่ กด 'เทสเสร็จแล้ว' ก่อน", ephemeral: true });
                return;
            }

            if (state.queue.length === 0) {
                await interaction.reply({ content: "ไม่มีคนในคิวแล้ว", ephemeral: true });
                return;
            }

            await interaction.deferUpdate();

            const nextItem = state.queue.shift();
            const room = await createTestRoom(interaction.guild, interaction.user.id, nextItem, interaction.channel);

            state.currentTesting = {
                userId: nextItem.userId,
                detail: nextItem.detail,
                mode: nextItem.mode,
                testerId: interaction.user.id,
                channelId: room.id,
            };

            await interaction.editReply({ embeds: [buildEmbed(interaction.channelId)], components: buildButtons(interaction.channelId) });
            return;
        }

        if (interaction.customId === "finish_testing") {
            if (!isTester) {
                await interaction.reply({ content: "คุณไม่มีสิทธิ์เป็น Tester", ephemeral: true });
                return;
            }

            const state = getState(interaction.channelId);

            if (state.currentTesting === null) {
                await interaction.reply({ content: "ไม่มีใครกำลังทดสอบอยู่", ephemeral: true });
                return;
            }

            await interaction.deferUpdate();

            const finishedUserId = state.currentTesting.userId;
            state.lastFinished = finishedUserId;

            testCooldowns.set(finishedUserId, Date.now());
            saveCooldowns();

            if (state.currentTesting.channelId) {
                const room = interaction.guild.channels.cache.get(state.currentTesting.channelId);
                if (room) {
                    await room.delete().catch(() => {});
                }
            }

            state.currentTesting = null;

            await interaction.editReply({ embeds: [buildEmbed(interaction.channelId)], components: buildButtons(interaction.channelId) });
            return;
        }

        if (interaction.customId === "give_tier") {
            if (!isTester) {
                await interaction.reply({ content: "คุณไม่มีสิทธิ์เป็น Tester", ephemeral: true });
                return;
            }

            const found = getStateByRoom(interaction.channelId);

            if (!found) {
                await interaction.reply({ content: "ไม่พบข้อมูลการทดสอบในห้องนี้", ephemeral: true });
                return;
            }

            const tierSelect = new StringSelectMenuBuilder()
                .setCustomId("givepick_tier_select")
                .setPlaceholder("เลือก Tier ที่จะให้")
                .addOptions(
                    tierOptions.map((tier) => ({ label: tier, value: tier }))
                );

            const selectRow = new ActionRowBuilder().addComponents(tierSelect);
            await interaction.reply({ content: "เลือก Tier ที่จะให้", components: [selectRow], ephemeral: true });
            return;
        }

        if (interaction.customId.startsWith("givepick_winner|")) {
            const winnerSide = interaction.customId.split("|")[1];
            const picked = pendingTierPick.get(interaction.user.id);

            if (!picked) {
                await interaction.update({ content: "เกิดข้อผิดพลาด กรุณากด 'ให้ Tier' ใหม่", components: [] });
                return;
            }

            picked.winnerSide = winnerSide;
            pendingTierPick.set(interaction.user.id, picked);
const modal = new ModalBuilder()
    .setCustomId("tier_score_modal")
    .setTitle("ผลการทดสอบ");

const tierInput = new TextInputBuilder()
    .setCustomId("tier_value_confirm")
    .setLabel("Tier")
    .setStyle(TextInputStyle.Short)
    .setValue(picked.tier);

const scoreInput = new TextInputBuilder()
    .setCustomId("tier_score")
    .setLabel("Score")
    .setStyle(TextInputStyle.Short);

const pointInput = new TextInputBuilder()
    .setCustomId("tier_points")
    .setLabel("Points")
    .setStyle(TextInputStyle.Short);

modal.addComponents(
    new ActionRowBuilder().addComponents(tierInput),
    new ActionRowBuilder().addComponents(scoreInput),
    new ActionRowBuilder().addComponents(pointInput)
);
await interaction.showModal(modal);
                
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "givepick_tier_select") {
            const selectedTier = interaction.values[0];
            const found = getStateByRoom(interaction.channelId);

            if (!found) {
                await interaction.update({ content: "ไม่พบข้อมูลการทดสอบ", components: [] });
                return;
            }

            pendingTierPick.set(interaction.user.id, {
                tier: selectedTier,
                mode: found.state.currentTesting.mode,
                testedUserId: found.state.currentTesting.userId,
                testerUserId: found.state.currentTesting.testerId,
            });

            const winnerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("givepick_winner|applicant")
                    .setLabel("ผู้ท้าชิงชนะ")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("givepick_winner|tester")
                    .setLabel("Tester ชนะ")
                    .setStyle(ButtonStyle.Danger)
            );

            const modeShown = found.state.currentTesting.mode || "ไม่ระบุ";
            await interaction.update({ content: "Tier: " + selectedTier + " | โหมด: " + modeShown + "\nใครชนะ?", components: [winnerRow] });
            return;
        }
    }
    if (interaction.isModalSubmit()) {

    if (interaction.customId !== "tier_score_modal") return;

    const picked = pendingTierPick.get(interaction.user.id);

    if (!picked) {
        return interaction.reply({
            content: "ไม่พบข้อมูลการทดสอบ",
            ephemeral: true
        });
    }

    const tier = interaction.fields.getTextInputValue("tier_value_confirm");
    const score = interaction.fields.getTextInputValue("tier_score");
    const points = interaction.fields.getTextInputValue("tier_points");
    const player = verifiedUsers.get(picked.testedUserId);

if (player) {
    player.tier = tier;
    player.points = points;
    verifiedUsers.set(picked.testedUserId, player);
    saveVerifiedUsers();
}
const playerInfoChannel = interaction.guild.channels.cache.find(
    c => c.name === playerInfoChannelName
);

if (playerInfoChannel) {

    const messageId = playerMessages.get(picked.testedUserId);

    if (messageId) {

        try {

            const msg = await playerInfoChannel.messages.fetch(messageId);

            const playerEmbed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle("ข้อมูลผู้เล่น")
                .addFields(
                    {
                        name: "Discord",
                        value: `<@${picked.testedUserId}>`,
                        inline: true
                    },
                    {
                        name: "ชื่อในเกม",
                        value: player.gameName,
                        inline: true
                    },
                    {
                        name: "Tier",
                        value: player.tier || "-",
                        inline: true
                    },
                    {
                        name: "Points",
                        value: player.points || "0",
                        inline: true
                    }
                )
                .setImage(player.imageUrl)
                .setTimestamp();

            await msg.edit({
                embeds: [playerEmbed]
            });

        } catch (err) {
            console.log(err);
        }

    }

}
const resultsChannel = await getOrCreateResultsChannel(interaction.guild);

if (resultsChannel) {
    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("ผลการทดสอบ")
        .addFields(
            {
                name: "ผู้ทดสอบ",
                value: `<@${picked.testerUserId}>`,
                inline: true
            },
            {
                name: "ผู้สมัคร",
                value: `<@${picked.testedUserId}>`,
                inline: true
            },
            {
                name: "Tier",
                value: tier,
                inline: true
            },
            {
                name: "Score",
                value: score,
                inline: true
            },
            {
                name: "Points",
                value: points,
                inline: true
            },
            {
                name: "ผู้ชนะ",
                value: picked.winnerSide === "tester"
                    ? `<@${picked.testerUserId}>`
                    : `<@${picked.testedUserId}>`
            }
        )
        .setTimestamp();

    await resultsChannel.send({
        embeds: [embed]
    });
}
pendingTierPick.delete(interaction.user.id);

await interaction.reply({
    content: "บันทึกผลการทดสอบเรียบร้อยแล้ว",
    ephemeral: true
});
const found = getStateByRoom(interaction.channelId);

if (found) {
    found.state.lastFinished = picked.testedUserId;

    testCooldowns.set(picked.testedUserId, Date.now());
    saveCooldowns();

    found.state.currentTesting = null;

    const queueChannel = interaction.guild.channels.cache.get(found.queueChannelId);

    if (queueChannel) {
        const msg = (await queueChannel.messages.fetch({ limit: 10 }))
            .find(m => m.author.id === client.user.id && m.components.length);

        if (msg) {
            await msg.edit({
                embeds: [buildEmbed(found.queueChannelId)],
                components: buildButtons(found.queueChannelId)
            });
        }
    }

    await interaction.channel.delete().catch(() => {});
}
}
});
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
if (message.content.startsWith("VERIFY:")) {

    const parts = message.content.split(":");

    const discordId = parts[1];
    const gameName = parts[2];

    verifiedUsers.set(discordId, {
        gameName: gameName,
        imageUrl: "https://mc-heads.net/body/" + gameName
    });

    saveVerifiedUsers();

    const playerInfoChannel = message.guild.channels.cache.find(
        c => c.name === playerInfoChannelName
    );

    if (playerInfoChannel) {

        const player = verifiedUsers.get(discordId);

const playerEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("ข้อมูลผู้เล่น")
            .addFields(
    {
        name: "Discord",
        value: "<@" + discordId + ">",
        inline: true
    },
    {
        name: "ชื่อในเกม",
        value: gameName,
        inline: true
    },
    {
        name: "Tier",
        value: player?.tier || "-",
        inline: true
    },
    {
        name: "Points",
        value: player?.points || "0",
        inline: true
    }
)
            .setImage("https://mc-heads.net/body/" + gameName)
            .setTimestamp();

        const oldMessageId = playerMessages.get(discordId);

if (oldMessageId) {

    try {

        const oldMessage = await playerInfoChannel.messages.fetch(oldMessageId);

        await oldMessage.edit({
            embeds: [playerEmbed]
        });

    } catch {

        const newMessage = await playerInfoChannel.send({
            embeds: [playerEmbed]
        });

        playerMessages.set(discordId, newMessage.id);
        savePlayerMessages();

    }

} else {

    const newMessage = await playerInfoChannel.send({
        embeds: [playerEmbed]
    });

    playerMessages.set(discordId, newMessage.id);
    savePlayerMessages();

}
    }

    return;
}
    if (message.content.startsWith("!setup") && !message.content.startsWith("!setupverify")) {
        const parts = message.content.trim().split(/\s+/);
        if (parts.length > 1) {
            const mode = parts[1].toUpperCase();
            if (modeOptions.includes(mode)) {
                channelModes.set(message.channelId, mode);
                saveChannelModes();
            }
        }
        await message.channel.send({ embeds: [buildEmbed(message.channelId)], components: buildButtons(message.channelId) });
        return;
    }

    if (message.content === "!setupverify") {
        await message.channel.send({ embeds: [buildVerifyEmbed()], components: [buildVerifyButton()] });
        return;
    }

    if (message.content.startsWith("!resetcooldown")) {
        const member = message.member;
        const isTester = member.roles.cache.some((role) => role.name === testerRoleName);
        const isAdmin = member.roles.cache.some((role) => role.name === adminRoleName);

        if (!isTester && !isAdmin) {
            await message.reply("คุณไม่มีสิทธิ์ใช้คำสั่งนี้");
            return;
        }

        const mentioned = message.mentions.users.first();
        if (!mentioned) {
            await message.reply("กรุณาแท็กคนที่ต้องการยกเลิกการรอ เช่น !resetcooldown @ชื่อคน");
            return;
        }

        testCooldowns.delete(mentioned.id);
        saveCooldowns();

        await message.reply("ยกเลิกการรอให้ <@" + mentioned.id + "> เรียบร้อยแล้ว จองคิวได้ทันที");
        return;
    }

});

client.once("clientReady", () => {
    console.log("บอทออนไลน์แล้ว!");
});

process.on("unhandledRejection", (error) => {
    console.log("เกิดข้อผิดพลาด (ไม่ทำให้บอทดับ):", error.message);
});
const TOKEN = process.env.TOKEN;

client.login(process.env.TOKEN);