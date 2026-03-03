import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "../lib/auth";
import { uploadToCloudinary, submitProof } from "../lib/proofs";

export default function ProofSubmitScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { session } = useAuth();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const handleGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!imageUri) return Alert.alert("No image", "Please select an image first.");
    if (!session?.access_token) return Alert.alert("Not signed in", "Please sign in to submit proof.");

    setUploading(true);
    try {
      const cloudinaryUrl = await uploadToCloudinary(imageUri);
      await submitProof(goalId, cloudinaryUrl, "photo", caption, session.access_token);
      router.back();
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Something went wrong.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Submit Proof</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Pick image buttons */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Choose media</Text>
          <View style={styles.pickerRow}>
            <Pressable style={styles.pickerBtn} onPress={handleCamera}>
              <Text style={styles.pickerBtnText}>📷  Camera</Text>
            </Pressable>
            <Pressable style={styles.pickerBtn} onPress={handleGallery}>
              <Text style={styles.pickerBtnText}>🖼️  Gallery</Text>
            </Pressable>
          </View>
        </View>

        {/* Image preview */}
        {imageUri && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Preview</Text>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
          </View>
        )}

        {/* Caption */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Caption</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="What did you do? 💪"
            placeholderTextColor="#B0A89E"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={280}
          />
          <Text style={styles.charCount}>{caption.length}/280</Text>
        </View>

        {/* Upload status */}
        {uploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color="#7C9473" />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        )}

        {/* Submit */}
        <Pressable
          style={[styles.submitBtn, (!imageUri || uploading) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!imageUri || uploading}
        >
          <Text style={styles.submitBtnText}>
            {uploading ? "Uploading…" : "Submit Proof ✓"}
          </Text>
        </Pressable>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3EF" },

  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FDFAF5",
    borderRadius: 10,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  backBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#2F2F2F",
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#2F2F2F",
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },

  card: {
    backgroundColor: "#FDFAF5",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#2F2F2F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    color: "#8A8075",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  pickerRow: { flexDirection: "row", gap: 12 },
  pickerBtn: {
    flex: 1,
    backgroundColor: "#F0EDE8",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    color: "#2F2F2F",
  },

  preview: {
    width: "100%",
    height: 240,
    borderRadius: 14,
    backgroundColor: "#E8E2D9",
  },

  captionInput: {
    backgroundColor: "#F0EDE8",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#2F2F2F",
    minHeight: 90,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#B0A89E",
    textAlign: "right",
  },

  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
  },
  uploadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#7C9473",
  },

  submitBtn: {
    backgroundColor: "#2F2F2F",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
