import { supabase } from "./supabase";

export type Comment = {
  id: string;
  proof_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export async function uploadToCloudinary(
  uri: string,
  mimeType: string = "image/jpeg"
): Promise<string> {
  const blob = await fetch(uri).then((r) => r.blob());

  const form = new FormData();
  form.append("file", blob as unknown as Blob, `upload.${mimeType.split("/")[1]}`);
  form.append("upload_preset", process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/upload`,
    { method: "POST", body: form }
  );

  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);

  const json = await res.json();
  return json.secure_url as string;
}

export async function submitProof(
  goalId: string,
  mediaUrl: string,
  mediaType: "photo" | "video" | "text" | "voice",
  caption: string,
  accessToken: string
): Promise<{ id: string; streak_period: string }> {
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/submit-proof`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ goal_id: goalId, media_url: mediaUrl, media_type: mediaType, caption }),
    }
  );

  if (!res.ok) throw new Error(`submitProof failed: ${res.status}`);

  return res.json();
}

export async function voteOnProof(
  proofId: string,
  vote: "approve" | "dispute",
  accessToken: string
): Promise<{ status: string; approve_count: number; dispute_count: number }> {
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/vote-on-proof`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ proof_id: proofId, vote }),
    }
  );

  if (!res.ok) throw new Error(`voteOnProof failed: ${res.status}`);

  return res.json();
}

export async function addReaction(proofId: string, emoji: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("proof_reactions")
    .insert({ proof_id: proofId, user_id: user?.id, emoji });

  if (error) throw error;
}

export async function addComment(proofId: string, body: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("proof_comments")
    .insert({ proof_id: proofId, user_id: user?.id, body });

  if (error) throw error;
}

export async function fetchComments(proofId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("proof_comments")
    .select("id, proof_id, user_id, body, created_at")
    .eq("proof_id", proofId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as Comment[];
}
