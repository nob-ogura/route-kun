// Auto-generated stub by generate-types.mjs (fallback)
// Replace by running: supabase gen types typescript --db-url $SUPABASE_DB_URL

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      distance_cache: {
        Row: {
          key: string;
          origin_lat: number;
          origin_lng: number;
          destination_lat: number;
          destination_lng: number;
          mode: string;
          time_bucket: string;
          distance_m: number;
          duration_s: number;
          provider: string;
          status: string;
          requested_at: string;
          expires_at: string;
          request_fingerprint: string;
          metadata: Json;
          hit_count: number;
          last_hit_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          origin_lat: number;
          origin_lng: number;
          destination_lat: number;
          destination_lng: number;
          mode: string;
          time_bucket: string;
          distance_m: number;
          duration_s: number;
          provider?: string;
          status?: string;
          requested_at?: string;
          expires_at: string;
          request_fingerprint: string;
          metadata?: Json;
          hit_count?: number;
          last_hit_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          origin_lat?: number;
          origin_lng?: number;
          destination_lat?: number;
          destination_lng?: number;
          mode?: string;
          time_bucket?: string;
          distance_m?: number;
          duration_s?: number;
          provider?: string;
          status?: string;
          requested_at?: string;
          expires_at?: string;
          request_fingerprint?: string;
          metadata?: Json;
          hit_count?: number;
          last_hit_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      routes: {
        Row: {
          id: string;
          user_id: string;
          origin_id: string;
          origin_label: string | null;
          origin_lat: number;
          origin_lng: number;
          destination_count: number;
          total_distance_m: number;
          total_duration_s: number;
          algorithm: string;
          params_digest: string;
          params_snapshot: Json;
          diagnostics: Json;
          distance_cache_hit_count: number;
          distance_cache_miss_count: number;
          created_at: string;
          updated_at: string;
          start_location: unknown | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          origin_id: string;
          origin_label?: string | null;
          origin_lat: number;
          origin_lng: number;
          destination_count: number;
          total_distance_m: number;
          total_duration_s: number;
          algorithm: string;
          params_digest: string;
          params_snapshot: Json;
          diagnostics: Json;
          distance_cache_hit_count?: number;
          distance_cache_miss_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          origin_id?: string;
          origin_label?: string | null;
          origin_lat?: number;
          origin_lng?: number;
          destination_count?: number;
          total_distance_m?: number;
          total_duration_s?: number;
          algorithm?: string;
          params_digest?: string;
          params_snapshot?: Json;
          diagnostics?: Json;
          distance_cache_hit_count?: number;
          distance_cache_miss_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      route_stops: {
        Row: {
          id: string;
          route_id: string;
          user_id: string;
          stop_id: string;
          label: string | null;
          lat: number;
          lng: number;
          sequence: number;
          distance_from_previous_m: number;
          duration_from_previous_s: number;
          cumulative_distance_m: number;
          cumulative_duration_s: number;
          raw_input: Json;
          created_at: string;
          location: unknown | null;
        };
        Insert: {
          id?: string;
          route_id: string;
          user_id: string;
          stop_id: string;
          label?: string | null;
          lat: number;
          lng: number;
          sequence: number;
          distance_from_previous_m?: number;
          duration_from_previous_s?: number;
          cumulative_distance_m?: number;
          cumulative_duration_s?: number;
          raw_input: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          route_id?: string;
          user_id?: string;
          stop_id?: string;
          label?: string | null;
          lat?: number;
          lng?: number;
          sequence?: number;
          distance_from_previous_m?: number;
          duration_from_previous_s?: number;
          cumulative_distance_m?: number;
          cumulative_duration_s?: number;
          raw_input?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "route_stops_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_distance_cache_hit: {
        Args: {
          cache_key: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
