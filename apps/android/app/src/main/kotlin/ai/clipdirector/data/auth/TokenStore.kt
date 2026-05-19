package ai.clipdirector.data.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class Tokens(
    val accessToken: String,
    val refreshToken: String,
    val email: String,
)

private val Context.tokensDataStore by preferencesDataStore(name = "auth_tokens")
private val TOKENS_KEY = stringPreferencesKey("tokens_json")

/**
 * Single source of truth for the currently-logged-in user's tokens.
 *
 * Backed by DataStore preferences. Token-at-rest encryption is NOT applied
 * at this layer — Android's per-user FBE protects app private storage on
 * modern devices. Phase 11 may layer EncryptedSharedPreferences if the
 * threat model warrants it.
 */
class TokenStore(private val context: Context) {

    val tokens: Flow<Tokens?> = context.tokensDataStore.data.map { prefs ->
        prefs[TOKENS_KEY]?.let { json -> Json.decodeFromString<Tokens>(json) }
    }

    suspend fun current(): Tokens? = tokens.first()

    suspend fun save(tokens: Tokens) {
        context.tokensDataStore.edit { prefs ->
            prefs[TOKENS_KEY] = Json.encodeToString(Tokens.serializer(), tokens)
        }
    }

    suspend fun clear() {
        context.tokensDataStore.edit { prefs ->
            prefs.remove(TOKENS_KEY)
        }
    }
}
