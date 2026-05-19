package ai.clipdirector.data.job

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.jobIdsDataStore by preferencesDataStore(name = "job_history")
private val JOB_IDS_KEY = stringPreferencesKey("job_ids_csv")
private const val MAX_HISTORY = 100

/**
 * Persists the list of jobIds the current user has submitted. Stored as
 * a comma-separated string (jobIds are UUIDs — no commas). Most recent
 * first. Cap at [MAX_HISTORY] so an over-active user doesn't bloat prefs.
 *
 * Job *details* are NOT persisted — the gateway is authoritative for
 * status/output/progress, so the ProcessingViewModel / HistoryViewModel
 * fetch fresh per render.
 */
class JobIdStore(private val context: Context) {

    val jobIds: Flow<List<String>> = context.jobIdsDataStore.data.map { prefs ->
        prefs[JOB_IDS_KEY]
            ?.split(",")
            ?.filter { it.isNotBlank() }
            ?: emptyList()
    }

    suspend fun add(jobId: String) {
        context.jobIdsDataStore.edit { prefs ->
            val current = prefs[JOB_IDS_KEY]
                ?.split(",")
                ?.filter { it.isNotBlank() }
                ?: emptyList()
            val updated = (listOf(jobId) + current.filter { it != jobId }).take(MAX_HISTORY)
            prefs[JOB_IDS_KEY] = updated.joinToString(",")
        }
    }

    suspend fun clear() {
        context.jobIdsDataStore.edit { it.remove(JOB_IDS_KEY) }
    }
}
