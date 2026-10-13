/**
 * Tipos do banco, gerados pelo Supabase a partir do esquema real (supabase/migrations/).
 * NÃO edite à mão: depois de uma nova migração, gere de novo (MCP generate_typescript_types ou
 * `supabase gen types typescript`) e confira o diff. Só o tipo `Database` é usado pelo aplicativo.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      evaluations: {
        Row: {
          ata: number;
          blq: number;
          created_at: string;
          def: number;
          demo: boolean;
          evaluated_at: string;
          evaluator: string;
          id: string;
          imp: number;
          lei: number;
          lev: number;
          note: string;
          player_id: string;
          rec: number;
          sac: number;
          team_id: string;
          vel: number;
        };
        Insert: {
          ata: number;
          blq: number;
          created_at: string;
          def: number;
          demo?: boolean;
          evaluated_at: string;
          evaluator?: string;
          id: string;
          imp: number;
          lei: number;
          lev: number;
          note?: string;
          player_id: string;
          rec: number;
          sac: number;
          team_id: string;
          vel: number;
        };
        Update: {
          ata?: number;
          blq?: number;
          created_at?: string;
          def?: number;
          demo?: boolean;
          evaluated_at?: string;
          evaluator?: string;
          id?: string;
          imp?: number;
          lei?: number;
          lev?: number;
          note?: string;
          player_id?: string;
          rec?: number;
          sac?: number;
          team_id?: string;
          vel?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluations_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      lineup_bench: {
        Row: { lineup_id: string; player_id: string; sort_order: number; team_id: string };
        Insert: { lineup_id: string; player_id: string; sort_order: number; team_id: string };
        Update: { lineup_id?: string; player_id?: string; sort_order?: number; team_id?: string };
        Relationships: [
          {
            foreignKeyName: 'lineup_bench_team_id_lineup_id_fkey';
            columns: ['team_id', 'lineup_id'];
            isOneToOne: false;
            referencedRelation: 'lineups';
            referencedColumns: ['team_id', 'id'];
          },
          {
            foreignKeyName: 'lineup_bench_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      lineup_starters: {
        Row: { lineup_id: string; player_id: string; role: string; slot: number; team_id: string };
        Insert: { lineup_id: string; player_id: string; role: string; slot: number; team_id: string };
        Update: { lineup_id?: string; player_id?: string; role?: string; slot?: number; team_id?: string };
        Relationships: [
          {
            foreignKeyName: 'lineup_starters_team_id_lineup_id_fkey';
            columns: ['team_id', 'lineup_id'];
            isOneToOne: false;
            referencedRelation: 'lineups';
            referencedColumns: ['team_id', 'id'];
          },
          {
            foreignKeyName: 'lineup_starters_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      lineups: {
        Row: {
          competition: string;
          created_at: string;
          demo: boolean;
          formation: string;
          id: string;
          libero_id: string | null;
          opponent: string;
          scheduled_at: string;
          team_id: string;
          title: string;
          updated_at: string;
          venue: string;
        };
        Insert: {
          competition?: string;
          created_at: string;
          demo?: boolean;
          formation?: string;
          id: string;
          libero_id?: string | null;
          opponent?: string;
          scheduled_at?: string;
          team_id: string;
          title: string;
          updated_at: string;
          venue?: string;
        };
        Update: {
          competition?: string;
          created_at?: string;
          demo?: boolean;
          formation?: string;
          id?: string;
          libero_id?: string | null;
          opponent?: string;
          scheduled_at?: string;
          team_id?: string;
          title?: string;
          updated_at?: string;
          venue?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lineups_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lineups_team_id_libero_id_fkey';
            columns: ['team_id', 'libero_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      match_set_starters: {
        Row: {
          match_id: string;
          player_id: string;
          role: string;
          set_number: number;
          slot: number;
          team_id: string;
        };
        Insert: {
          match_id: string;
          player_id: string;
          role: string;
          set_number: number;
          slot: number;
          team_id: string;
        };
        Update: {
          match_id?: string;
          player_id?: string;
          role?: string;
          set_number?: number;
          slot?: number;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_set_starters_team_id_match_id_set_number_fkey';
            columns: ['team_id', 'match_id', 'set_number'];
            isOneToOne: false;
            referencedRelation: 'match_sets';
            referencedColumns: ['team_id', 'match_id', 'number'];
          },
          {
            foreignKeyName: 'match_set_starters_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      match_sets: {
        Row: {
          created_at: string;
          first_server: string;
          libero_id: string | null;
          match_id: string;
          number: number;
          team_id: string;
        };
        Insert: {
          created_at: string;
          first_server: string;
          libero_id?: string | null;
          match_id: string;
          number: number;
          team_id: string;
        };
        Update: {
          created_at?: string;
          first_server?: string;
          libero_id?: string | null;
          match_id?: string;
          number?: number;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_sets_team_id_libero_id_fkey';
            columns: ['team_id', 'libero_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
          {
            foreignKeyName: 'match_sets_team_id_match_id_fkey';
            columns: ['team_id', 'match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      matches: {
        Row: {
          best_of: number;
          competition: string;
          concluded_at: string | null;
          created_at: string;
          deciding_set_points: number;
          final_sets_them: number | null;
          final_sets_us: number | null;
          id: string;
          lineup_id: string | null;
          min_lead: number;
          opponent: string;
          scheduled_at: string;
          set_points: number;
          status: string;
          team_id: string;
          updated_at: string;
          venue: string;
        };
        Insert: {
          best_of?: number;
          competition?: string;
          concluded_at?: string | null;
          created_at: string;
          deciding_set_points?: number;
          final_sets_them?: number | null;
          final_sets_us?: number | null;
          id: string;
          lineup_id?: string | null;
          min_lead?: number;
          opponent: string;
          scheduled_at?: string;
          set_points?: number;
          status?: string;
          team_id: string;
          updated_at: string;
          venue?: string;
        };
        Update: {
          best_of?: number;
          competition?: string;
          concluded_at?: string | null;
          created_at?: string;
          deciding_set_points?: number;
          final_sets_them?: number | null;
          final_sets_us?: number | null;
          id?: string;
          lineup_id?: string | null;
          min_lead?: number;
          opponent?: string;
          scheduled_at?: string;
          set_points?: number;
          status?: string;
          team_id?: string;
          updated_at?: string;
          venue?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'matches_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matches_team_id_lineup_id_fkey';
            columns: ['team_id', 'lineup_id'];
            isOneToOne: false;
            referencedRelation: 'lineups';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      overall_weights: {
        Row: {
          ata: number;
          blq: number;
          def: number;
          imp: number;
          lei: number;
          lev: number;
          position: string;
          rec: number;
          sac: number;
          team_id: string;
          vel: number;
        };
        Insert: {
          ata: number;
          blq: number;
          def: number;
          imp: number;
          lei: number;
          lev: number;
          position: string;
          rec: number;
          sac: number;
          team_id: string;
          vel: number;
        };
        Update: {
          ata?: number;
          blq?: number;
          def?: number;
          imp?: number;
          lei?: number;
          lev?: number;
          position?: string;
          rec?: number;
          sac?: number;
          team_id?: string;
          vel?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'overall_weights_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      players: {
        Row: {
          coach_notes: string;
          created_at: string;
          demo: boolean;
          id: string;
          jersey_number: number;
          name: string;
          primary_position: string;
          secondary_position: string | null;
          status: string;
          team_id: string;
          uniform: string;
          updated_at: string;
        };
        Insert: {
          coach_notes?: string;
          created_at: string;
          demo?: boolean;
          id: string;
          jersey_number: number;
          name: string;
          primary_position: string;
          secondary_position?: string | null;
          status?: string;
          team_id: string;
          uniform?: string;
          updated_at: string;
        };
        Update: {
          coach_notes?: string;
          created_at?: string;
          demo?: boolean;
          id?: string;
          jersey_number?: number;
          name?: string;
          primary_position?: string;
          secondary_position?: string | null;
          status?: string;
          team_id?: string;
          uniform?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'players_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      rallies: {
        Row: {
          attempt_key: string;
          id: string;
          match_id: string;
          player_id: string | null;
          reason: string | null;
          recorded_at: string;
          rotation: number;
          seq: number;
          server_player_id: string | null;
          serving_side: string;
          set_number: number;
          team_id: string;
          voided_at: string | null;
          voided_by: string | null;
          winner_side: string;
        };
        Insert: {
          attempt_key: string;
          id: string;
          match_id: string;
          player_id?: string | null;
          reason?: string | null;
          recorded_at: string;
          rotation: number;
          seq: number;
          server_player_id?: string | null;
          serving_side: string;
          set_number: number;
          team_id: string;
          voided_at?: string | null;
          voided_by?: string | null;
          winner_side: string;
        };
        Update: {
          attempt_key?: string;
          id?: string;
          match_id?: string;
          player_id?: string | null;
          reason?: string | null;
          recorded_at?: string;
          rotation?: number;
          seq?: number;
          server_player_id?: string | null;
          serving_side?: string;
          set_number?: number;
          team_id?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          winner_side?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rallies_team_id_match_id_set_number_fkey';
            columns: ['team_id', 'match_id', 'set_number'];
            isOneToOne: false;
            referencedRelation: 'match_sets';
            referencedColumns: ['team_id', 'match_id', 'number'];
          },
          {
            foreignKeyName: 'rallies_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
          {
            foreignKeyName: 'rallies_team_id_server_player_id_fkey';
            columns: ['team_id', 'server_player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      rally_actions: {
        Row: {
          attempt_key: string;
          fundamental: string;
          id: string;
          match_id: string;
          outcome: string;
          player_id: string;
          rally_id: string;
          recorded_at: string;
          team_id: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          attempt_key: string;
          fundamental: string;
          id: string;
          match_id: string;
          outcome: string;
          player_id: string;
          rally_id: string;
          recorded_at: string;
          team_id: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          attempt_key?: string;
          fundamental?: string;
          id?: string;
          match_id?: string;
          outcome?: string;
          player_id?: string;
          rally_id?: string;
          recorded_at?: string;
          team_id?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rally_actions_team_id_match_id_rally_id_fkey';
            columns: ['team_id', 'match_id', 'rally_id'];
            isOneToOne: false;
            referencedRelation: 'rallies';
            referencedColumns: ['team_id', 'match_id', 'id'];
          },
          {
            foreignKeyName: 'rally_actions_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      team_members: {
        Row: { created_at: string; role: string; team_id: string; user_id: string };
        Insert: { created_at?: string; role: string; team_id: string; user_id: string };
        Update: { created_at?: string; role?: string; team_id?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: 'team_members_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      teams: {
        Row: { created_at: string; id: string; name: string };
        Insert: { created_at?: string; id?: string; name: string };
        Update: { created_at?: string; id?: string; name?: string };
        Relationships: [];
      };
      training_events: {
        Row: {
          attempt_key: string;
          demo: boolean;
          exercise_id: string;
          fundamental: string;
          id: string;
          outcome: string;
          player_id: string;
          recorded_at: string;
          team_id: string;
          training_id: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          attempt_key: string;
          demo?: boolean;
          exercise_id: string;
          fundamental: string;
          id: string;
          outcome: string;
          player_id: string;
          recorded_at: string;
          team_id: string;
          training_id: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          attempt_key?: string;
          demo?: boolean;
          exercise_id?: string;
          fundamental?: string;
          id?: string;
          outcome?: string;
          player_id?: string;
          recorded_at?: string;
          team_id?: string;
          training_id?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'training_events_team_id_exercise_id_training_id_fkey';
            columns: ['team_id', 'exercise_id', 'training_id'];
            isOneToOne: false;
            referencedRelation: 'training_exercises';
            referencedColumns: ['team_id', 'id', 'training_id'];
          },
          {
            foreignKeyName: 'training_events_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
          {
            foreignKeyName: 'training_events_team_id_training_id_fkey';
            columns: ['team_id', 'training_id'];
            isOneToOne: false;
            referencedRelation: 'trainings';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      training_exercises: {
        Row: {
          created_at: string;
          focus: string | null;
          id: string;
          name: string;
          sort_order: number;
          team_id: string;
          training_id: string;
        };
        Insert: {
          created_at: string;
          focus?: string | null;
          id: string;
          name: string;
          sort_order: number;
          team_id: string;
          training_id: string;
        };
        Update: {
          created_at?: string;
          focus?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          team_id?: string;
          training_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'training_exercises_team_id_training_id_fkey';
            columns: ['team_id', 'training_id'];
            isOneToOne: false;
            referencedRelation: 'trainings';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      training_participants: {
        Row: { player_id: string; team_id: string; training_id: string };
        Insert: { player_id: string; team_id: string; training_id: string };
        Update: { player_id?: string; team_id?: string; training_id?: string };
        Relationships: [
          {
            foreignKeyName: 'training_participants_team_id_player_id_fkey';
            columns: ['team_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['team_id', 'id'];
          },
          {
            foreignKeyName: 'training_participants_team_id_training_id_fkey';
            columns: ['team_id', 'training_id'];
            isOneToOne: false;
            referencedRelation: 'trainings';
            referencedColumns: ['team_id', 'id'];
          },
        ];
      };
      trainings: {
        Row: {
          completed_at: string | null;
          created_at: string;
          demo: boolean;
          description: string;
          duration_minutes: number | null;
          held_on: string;
          id: string;
          name: string;
          notes: string;
          responsible: string;
          status: string;
          team_id: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at: string;
          demo?: boolean;
          description?: string;
          duration_minutes?: number | null;
          held_on: string;
          id: string;
          name: string;
          notes?: string;
          responsible?: string;
          status?: string;
          team_id: string;
          updated_at: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          demo?: boolean;
          description?: string;
          duration_minutes?: number | null;
          held_on?: string;
          id?: string;
          name?: string;
          notes?: string;
          responsible?: string;
          status?: string;
          team_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trainings_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      add_rally_action: { Args: { p_action: Json; p_team: string }; Returns: Json };
      add_team_member: { Args: { p_email: string; p_role: string; p_team: string }; Returns: undefined };
      cancel_empty_set: { Args: { p_match: string; p_number: number; p_team: string }; Returns: undefined };
      conclude_match: { Args: { p_match: string; p_team: string }; Returns: Json };
      create_team: { Args: { p_name: string }; Returns: string };
      record_rally: { Args: { p_match: string; p_rally: Json; p_team: string }; Returns: Json };
      reopen_match: { Args: { p_match: string; p_team: string }; Returns: Json };
      start_set: { Args: { p_match: string; p_set: Json; p_team: string }; Returns: undefined };
      void_last_rally: { Args: { p_match: string; p_rally: string; p_team: string }; Returns: undefined };
      void_rally_action: { Args: { p_action: string; p_team: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
