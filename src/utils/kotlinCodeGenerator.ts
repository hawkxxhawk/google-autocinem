export const KOTLIN_MAIN_ACTIVITY = `package com.autocinema.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.autocinema.ui.theme.AutoCinemaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AutoCinemaTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF0F172A) // Dark Slate
                ) {
                    AutoCinemaMainScreen()
                }
            }
        }
    }
}
`;

export const KOTLIN_VIEWMODEL = `package com.autocinema.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.autocinema.data.dao.AutoCinemaDao
import com.autocinema.data.entity.Folder
import com.autocinema.data.entity.MovieItem
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class AutoCinemaViewModel(private val dao: AutoCinemaDao) : ViewModel() {

    val folders: StateFlow<List<Folder>> = dao.getVisibleFolders()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _selectedFolderId = MutableStateFlow<String?>(null)
    val selectedFolderId: StateFlow<String?> = _selectedFolderId.asStateFlow()

    val moviesForSelectedFolder: StateFlow<List<MovieItem>> = _selectedFolderId
        .flatMapLatest { folderId ->
            if (folderId != null) dao.getMoviesByFolder(folderId) else flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun selectFolder(folderId: String) {
        _selectedFolderId.value = folderId
    }

    fun selectRandomFolder() {
        viewModelScope.launch {
            val visible = folders.value
            if (visible.isNotEmpty()) {
                val random = visible.random()
                _selectedFolderId.value = random.id
            }
        }
    }

    fun addMovie(movie: MovieItem) {
        viewModelScope.launch {
            dao.insertMovie(movie)
        }
    }

    fun toggleFavorite(movie: MovieItem) {
        viewModelScope.launch {
            dao.updateMovie(movie.copy(isFavorite = !movie.isFavorite))
        }
    }
}
`;

export const KOTLIN_COMPOSE_UI = `package com.autocinema.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.autocinema.data.entity.Folder
import com.autocinema.data.entity.MovieItem

@Composable
fun FolderPillsRow(
    folders: List<Folder>,
    selectedFolderId: String?,
    onFolderSelected: (String) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(folders) { folder ->
            val isSelected = folder.id == selectedFolderId
            Surface(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { onFolderSelected(folder.id) },
                color = if (isSelected) Color(0xFF7C3AED) else Color(0xFF1E293B),
                contentColor = Color.White
            ) {
                Text(
                    text = folder.name,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                )
            }
        }
    }
}

@Composable
fun MovieCardItem(
    movie: MovieItem,
    onMovieClick: (MovieItem) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onMovieClick(movie) },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
            ) {
                AsyncImage(
                    model = movie.posterUrl,
                    contentDescription = movie.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
                Surface(
                    modifier = Modifier
                        .padding(8.dp)
                        .align(Alignment.TopEnd),
                    shape = RoundedCornerShape(8.dp),
                    color = Color.Black.copy(alpha = 0.7f)
                ) {
                    Text(
                        text = movie.category,
                        color = Color.White,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                    )
                }
            }
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = movie.title,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = movie.description,
                    color = Color.LightGray,
                    fontSize = 11.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
`;

export const KOTLIN_ANDROID_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.autocinema">

    <!-- Permissions for Online Stream Loading & TV Networks -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Android TV 9 (API 28) Hardware Requirements -->
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
    <uses-feature android:name="android.software.leanback" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="AutoCinema"
        android:banner="@drawable/tv_banner"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.AutoCinema">
        <activity
            android:name=".ui.MainActivity"
            android:exported="true"
            android:screenOrientation="landscape"
            android:theme="@style/Theme.AutoCinema">
            
            <!-- Standard Mobile Launcher -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Android TV 9 (Leanback) Launcher Intent -->
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

export const KOTLIN_GRADLE_BUILD = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("kotlin-kapt")
}

android {
    namespace = "com.autocinema"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.autocinema"
        minSdk = 28 // Android 9 Pie (API 28)
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
}

dependencies {
    // Jetpack Compose
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("io.coil-kt:coil-compose:2.6.0")

    // Room Database
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
}
`;

export const KOTLIN_FOLDER_ENTITY = `package com.autocinema.data.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "folders")
data class Folder(
    @PrimaryKey val id: String,
    val name: String,
    val description: String,
    val color: String, // Hex string e.g., "#1E88E5"
    val sortBy: String, // "domain", "title", "date", "manual"
    val isFolderHidden: Boolean = false
)
`;

export const KOTLIN_MOVIE_ENTITY = `package com.autocinema.data.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "movie_items",
    foreignKeys = [
        ForeignKey(
            entity = Folder::class,
            parentColumns = ["id"],
            childColumns = ["parentFolderId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["parentFolderId"])]
)
data class MovieItem(
    @PrimaryKey val id: String,
    val title: String,
    val url: String,
    val embedUrl: String,
    val duration: String,
    val useDirectPlayer: Boolean,
    val description: String,
    val category: String,
    val posterUrl: String,
    val addedAt: String,
    val isHidden: Boolean = false,
    val isBroken: Boolean = false,
    val isFavorite: Boolean = false,
    val parentFolderId: String
)
`;

export const KOTLIN_DAO = `package com.autocinema.data.dao

import androidx.room.*
import com.autocinema.data.entity.Folder
import com.autocinema.data.entity.MovieItem
import kotlinx.coroutines.flow.Flow

@Dao
interface AutoCinemaDao {
    @Query("SELECT * FROM folders WHERE isFolderHidden = 0")
    fun getVisibleFolders(): Flow<List<Folder>>

    @Query("SELECT * FROM folders")
    fun getAllFolders(): Flow<List<Folder>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFolder(folder: Folder)

    @Update
    suspend fun updateFolder(folder: Folder)

    @Delete
    suspend fun deleteFolder(folder: Folder)

    @Query("SELECT * FROM movie_items WHERE parentFolderId = :folderId AND isHidden = 0")
    fun getMoviesByFolder(folderId: String): Flow<List<MovieItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMovie(movie: MovieItem)

    @Update
    suspend fun updateMovie(movie: MovieItem)

    @Delete
    suspend fun deleteMovie(movie: MovieItem)
}
`;

export const KOTLIN_DATABASE = `package com.autocinema.data

import androidx.room.Database
import androidx.room.RoomDatabase
import com.autocinema.data.dao.AutoCinemaDao
import com.autocinema.data.entity.Folder
import com.autocinema.data.entity.MovieItem

@Database(entities = [Folder::class, MovieItem::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun autoCinemaDao(): AutoCinemaDao
}
`;

