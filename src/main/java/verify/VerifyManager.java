package verify;

import org.bukkit.entity.Player;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

public class VerifyManager {

    private final Main plugin;

    private final Set<UUID> verifiedPlayers = new HashSet<>();

    public VerifyManager(Main plugin) {
        this.plugin = plugin;
    }

    public boolean isVerified(UUID uuid) {
        return verifiedPlayers.contains(uuid);
    }

    public void verify(Player player, String code) {

        player.sendMessage("§aโค้ดถูกต้อง");

        verifiedPlayers.add(player.getUniqueId());
    }

}