export interface CharacterHook {
  text: string;
  action: string;
  duration: number;
}

export interface CharacterCTA {
  text: string;
  note?: string;
}

export interface Character {
  id: string;
  name: string;
  short_bio: string | null;
  personality: string | null;
  speaking_style: string | null;
  catchphrases: string[];
  canonical_prompt: string | null;
  canonical_images: string[];
  face_reference_image: string | null;
  body_reference_image: string | null;
  active_outfit_image: string | null;
  hooks: CharacterHook[];
  ctas: CharacterCTA[];
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  character_id: string;
  created_at: string;
  updated_at: string;
}

export type SceneStatus = "pendente" | "gerado" | "aprovado";

export type CameraFraming = "selfie" | "meio_corpo" | "corpo_inteiro" | "plano_aberto";

export interface SceneHookOption {
  text: string;
  action: string;
  duration: number;
}

export interface Scene {
  id: string;
  project_id: string;
  scene_order: number;
  room_name: string;
  original_room_image: string | null;
  generated_character_image: string | null;
  hook_options: SceneHookOption[];
  selected_hook: SceneHookOption | null;
  script_options: string[];
  selected_script: string | null;
  cta: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  status: SceneStatus;
  camera_framing: CameraFraming;
  created_at: string;
  updated_at: string;
}
