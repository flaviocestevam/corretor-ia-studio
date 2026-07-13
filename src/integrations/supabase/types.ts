export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      animals: {
        Row: {
          canonical_image: string | null
          canonical_prompt: string | null
          created_at: string
          id: string
          name: string
          short_bio: string | null
          species: string | null
          updated_at: string
        }
        Insert: {
          canonical_image?: string | null
          canonical_prompt?: string | null
          created_at?: string
          id?: string
          name: string
          short_bio?: string | null
          species?: string | null
          updated_at?: string
        }
        Update: {
          canonical_image?: string | null
          canonical_prompt?: string | null
          created_at?: string
          id?: string
          name?: string
          short_bio?: string | null
          species?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      characters: {
        Row: {
          active_outfit_image: string | null
          body_reference_image: string | null
          canonical_images: Json
          canonical_prompt: string | null
          catchphrases: Json
          created_at: string
          ctas: Json
          face_reference_image: string | null
          height_cm: number | null
          hooks: Json
          id: string
          name: string
          personality: string | null
          short_bio: string | null
          speaking_style: string | null
          updated_at: string
        }
        Insert: {
          active_outfit_image?: string | null
          body_reference_image?: string | null
          canonical_images?: Json
          canonical_prompt?: string | null
          catchphrases?: Json
          created_at?: string
          ctas?: Json
          face_reference_image?: string | null
          height_cm?: number | null
          hooks?: Json
          id?: string
          name: string
          personality?: string | null
          short_bio?: string | null
          speaking_style?: string | null
          updated_at?: string
        }
        Update: {
          active_outfit_image?: string | null
          body_reference_image?: string | null
          canonical_images?: Json
          canonical_prompt?: string | null
          catchphrases?: Json
          created_at?: string
          ctas?: Json
          face_reference_image?: string | null
          height_cm?: number | null
          hooks?: Json
          id?: string
          name?: string
          personality?: string | null
          short_bio?: string | null
          speaking_style?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      google_accounts: {
        Row: {
          api_key: string
          created_at: string
          credits_used: number
          email: string
          id: string
          last_used_at: string | null
          password: string | null
          reset_at: string | null
          status: string
          storage_state: Json | null
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          credits_used?: number
          email: string
          id?: string
          last_used_at?: string | null
          password?: string | null
          reset_at?: string | null
          status?: string
          storage_state?: Json | null
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          credits_used?: number
          email?: string
          id?: string
          last_used_at?: string | null
          password?: string | null
          reset_at?: string | null
          status?: string
          storage_state?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          animal_id: string | null
          character_id: string | null
          client_id: string
          created_at: string
          id: string
          name: string
          project_type: string
          property_url: string | null
          updated_at: string
        }
        Insert: {
          animal_id?: string | null
          character_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          name: string
          project_type?: string
          property_url?: string | null
          updated_at?: string
        }
        Update: {
          animal_id?: string | null
          character_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          project_type?: string
          property_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_animal_id_fkey"
            columns: ["animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          camera_framing: string
          created_at: string
          cta: string | null
          generated_character_image: string | null
          hook_options: Json
          id: string
          image_prompt: string | null
          model_used: string | null
          negative_prompt: string | null
          original_room_image: string | null
          project_id: string
          room_name: string
          route_summary: string | null
          scene_mode: string
          scene_order: number
          script_options: Json
          selected_hook: Json | null
          selected_script: string | null
          status: string
          updated_at: string
          video_prompt: string | null
        }
        Insert: {
          camera_framing?: string
          created_at?: string
          cta?: string | null
          generated_character_image?: string | null
          hook_options?: Json
          id?: string
          image_prompt?: string | null
          model_used?: string | null
          negative_prompt?: string | null
          original_room_image?: string | null
          project_id: string
          room_name: string
          route_summary?: string | null
          scene_mode?: string
          scene_order: number
          script_options?: Json
          selected_hook?: Json | null
          selected_script?: string | null
          status?: string
          updated_at?: string
          video_prompt?: string | null
        }
        Update: {
          camera_framing?: string
          created_at?: string
          cta?: string | null
          generated_character_image?: string | null
          hook_options?: Json
          id?: string
          image_prompt?: string | null
          model_used?: string | null
          negative_prompt?: string | null
          original_room_image?: string | null
          project_id?: string
          room_name?: string
          route_summary?: string | null
          scene_mode?: string
          scene_order?: number
          script_options?: Json
          selected_hook?: Json | null
          selected_script?: string | null
          status?: string
          updated_at?: string
          video_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_jobs: {
        Row: {
          assigned_account: string | null
          attempts: number
          character_image: string | null
          created_at: string
          error_screenshot: string | null
          file_name: string | null
          flow_model: string
          google_account: string | null
          id: string
          project_id: string | null
          prompt: string
          property_image: string | null
          property_images: Json
          scene_id: string | null
          status: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          assigned_account?: string | null
          attempts?: number
          character_image?: string | null
          created_at?: string
          error_screenshot?: string | null
          file_name?: string | null
          flow_model?: string
          google_account?: string | null
          id?: string
          project_id?: string | null
          prompt: string
          property_image?: string | null
          property_images?: Json
          scene_id?: string | null
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          assigned_account?: string | null
          attempts?: number
          character_image?: string | null
          created_at?: string
          error_screenshot?: string | null
          file_name?: string | null
          flow_model?: string
          google_account?: string | null
          id?: string
          project_id?: string | null
          prompt?: string
          property_image?: string | null
          property_images?: Json
          scene_id?: string | null
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
