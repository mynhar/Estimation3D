// Generado con: npx supabase gen types typescript --linked
// Regenerar cuando cambien las migraciones en supabase/migrations/

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      archivo: {
        Row: {
          creado_en: string
          estimacion_id: string | null
          expediente_id: string | null
          id: string
          mime_type: string
          nombre_archivo: string
          oferta_id: string | null
          subido_por: string
          tamano_bytes: number | null
          tipo: Database["public"]["Enums"]["tipo_archivo"]
          url_storage: string
        }
        Insert: {
          creado_en?: string
          estimacion_id?: string | null
          expediente_id?: string | null
          id?: string
          mime_type: string
          nombre_archivo: string
          oferta_id?: string | null
          subido_por: string
          tamano_bytes?: number | null
          tipo: Database["public"]["Enums"]["tipo_archivo"]
          url_storage: string
        }
        Update: {
          creado_en?: string
          estimacion_id?: string | null
          expediente_id?: string | null
          id?: string
          mime_type?: string
          nombre_archivo?: string
          oferta_id?: string | null
          subido_por?: string
          tamano_bytes?: number | null
          tipo?: Database["public"]["Enums"]["tipo_archivo"]
          url_storage?: string
        }
        Relationships: [
          {
            foreignKeyName: "archivo_estimacion_id_fkey"
            columns: ["estimacion_id"]
            isOneToOne: false
            referencedRelation: "estimacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivo_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivo_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "oferta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archivo_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato: {
        Row: {
          actualizado_en: string
          cliente_id: string
          constructor_id: string
          descripcion_trabajo: string
          estado: Database["public"]["Enums"]["estado_contrato"]
          expediente_id: string
          firmado_en: string | null
          garantia_anos: number | null
          generado_en: string
          id: string
          oferta_id: string
          precio_final: number
          url_pdf: string | null
        }
        Insert: {
          actualizado_en?: string
          cliente_id: string
          constructor_id: string
          descripcion_trabajo: string
          estado?: Database["public"]["Enums"]["estado_contrato"]
          expediente_id: string
          firmado_en?: string | null
          garantia_anos?: number | null
          generado_en?: string
          id?: string
          oferta_id: string
          precio_final: number
          url_pdf?: string | null
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string
          constructor_id?: string
          descripcion_trabajo?: string
          estado?: Database["public"]["Enums"]["estado_contrato"]
          expediente_id?: string
          firmado_en?: string | null
          garantia_anos?: number | null
          generado_en?: string
          id?: string
          oferta_id?: string
          precio_final?: number
          url_pdf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_constructor_id_fkey"
            columns: ["constructor_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: true
            referencedRelation: "oferta"
            referencedColumns: ["id"]
          },
        ]
      }
      estimacion: {
        Row: {
          actualizado_en: string
          costo_estimado: number | null
          costo_estimado_max: number | null
          creado_en: string
          descripcion_problemas: string
          estimador_id: string
          expediente_id: string
          fecha_visita_real: string | null
          id: string
          notas_internas: string | null
          url_tour: string | null
        }
        Insert: {
          actualizado_en?: string
          costo_estimado?: number | null
          costo_estimado_max?: number | null
          creado_en?: string
          descripcion_problemas: string
          estimador_id: string
          expediente_id: string
          fecha_visita_real?: string | null
          id?: string
          notas_internas?: string | null
          url_tour?: string | null
        }
        Update: {
          actualizado_en?: string
          costo_estimado?: number | null
          costo_estimado_max?: number | null
          creado_en?: string
          descripcion_problemas?: string
          estimador_id?: string
          expediente_id?: string
          fecha_visita_real?: string | null
          id?: string
          notas_internas?: string | null
          url_tour?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimacion_estimador_id_fkey"
            columns: ["estimador_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimacion_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: true
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente: {
        Row: {
          actualizado_en: string
          cliente_id: string
          creado_en: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_expediente"]
          estimador_id: string | null
          fecha_visita: string
          id: string
          numero: string
          servicio_id: number
        }
        Insert: {
          actualizado_en?: string
          cliente_id: string
          creado_en?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_expediente"]
          estimador_id?: string | null
          fecha_visita: string
          id?: string
          numero: string
          servicio_id: number
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string
          creado_en?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_expediente"]
          estimador_id?: string | null
          fecha_visita?: string
          id?: string
          numero?: string
          servicio_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "expediente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_estimador_id_fkey"
            columns: ["estimador_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      localizacion: {
        Row: {
          canton: string
          direccion: string
          distrito: string | null
          expediente_id: string
          id: string
          latitud: number | null
          longitud: number | null
          provincia: string
          referencia: string | null
          tipo_inmueble: Database["public"]["Enums"]["tipo_inmueble"]
        }
        Insert: {
          canton: string
          direccion: string
          distrito?: string | null
          expediente_id: string
          id?: string
          latitud?: number | null
          longitud?: number | null
          provincia: string
          referencia?: string | null
          tipo_inmueble?: Database["public"]["Enums"]["tipo_inmueble"]
        }
        Update: {
          canton?: string
          direccion?: string
          distrito?: string | null
          expediente_id?: string
          id?: string
          latitud?: number | null
          longitud?: number | null
          provincia?: string
          referencia?: string | null
          tipo_inmueble?: Database["public"]["Enums"]["tipo_inmueble"]
        }
        Relationships: [
          {
            foreignKeyName: "localizacion_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: true
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
        ]
      }
      oferta: {
        Row: {
          actualizado_en: string
          constructor_id: string
          creado_en: string
          descripcion: string
          estado: Database["public"]["Enums"]["estado_oferta"]
          expediente_id: string
          fecha_inicio: string | null
          garantia_anos: number | null
          id: string
          plazo_semanas_max: number | null
          plazo_semanas_min: number | null
          precio: number
        }
        Insert: {
          actualizado_en?: string
          constructor_id: string
          creado_en?: string
          descripcion: string
          estado?: Database["public"]["Enums"]["estado_oferta"]
          expediente_id: string
          fecha_inicio?: string | null
          garantia_anos?: number | null
          id?: string
          plazo_semanas_max?: number | null
          plazo_semanas_min?: number | null
          precio: number
        }
        Update: {
          actualizado_en?: string
          constructor_id?: string
          creado_en?: string
          descripcion?: string
          estado?: Database["public"]["Enums"]["estado_oferta"]
          expediente_id?: string
          fecha_inicio?: string | null
          garantia_anos?: number | null
          id?: string
          plazo_semanas_max?: number | null
          plazo_semanas_min?: number | null
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "oferta_constructor_id_fkey"
            columns: ["constructor_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil: {
        Row: {
          activo: boolean
          actualizado_en: string
          apellido: string
          avatar_url: string | null
          creado_en: string
          email: string | null
          id: string
          nombre: string
          perfil_completo: boolean
          proveedor: Database["public"]["Enums"]["proveedor_auth"]
          rol: Database["public"]["Enums"]["rol_usuario"]
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          apellido?: string
          avatar_url?: string | null
          creado_en?: string
          email?: string | null
          id: string
          nombre?: string
          perfil_completo?: boolean
          proveedor?: Database["public"]["Enums"]["proveedor_auth"]
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          apellido?: string
          avatar_url?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          nombre?: string
          perfil_completo?: boolean
          proveedor?: Database["public"]["Enums"]["proveedor_auth"]
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
        }
        Relationships: []
      }
      servicio: {
        Row: {
          activo: boolean
          codigo: Database["public"]["Enums"]["tipo_servicio"]
          descripcion_en: string | null
          descripcion_es: string | null
          descripcion_fr: string | null
          id: number
          nombre_en: string
          nombre_es: string
          nombre_fr: string
        }
        Insert: {
          activo?: boolean
          codigo: Database["public"]["Enums"]["tipo_servicio"]
          descripcion_en?: string | null
          descripcion_es?: string | null
          descripcion_fr?: string | null
          id?: number
          nombre_en: string
          nombre_es: string
          nombre_fr: string
        }
        Update: {
          activo?: boolean
          codigo?: Database["public"]["Enums"]["tipo_servicio"]
          descripcion_en?: string | null
          descripcion_es?: string | null
          descripcion_fr?: string | null
          id?: number
          nombre_en?: string
          nombre_es?: string
          nombre_fr?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceptar_oferta: {
        Args: { p_expediente_id: string; p_oferta_id: string }
        Returns: undefined
      }
      cancelar_contrato: {
        Args: { p_expediente_id: string }
        Returns: undefined
      }
      cancelar_contrato_admin: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      firmar_contrato_admin: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      iniciar_ejecucion_contrato_admin: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      completar_contrato_admin: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      contar_ofertas_expedientes: {
        Args: { p_ids: string[] }
        Returns: {
          expediente_id: string
          total: number
        }[]
      }
      eliminar_oferta_admin: {
        Args: { p_expediente_id: string; p_oferta_id: string }
        Returns: undefined
      }
      firmar_contrato: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      get_rol_usuario: { Args: never; Returns: string }
      marcar_contratado: {
        Args: { p_expediente_id: string }
        Returns: undefined
      }
      mi_rol: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
    }
    Enums: {
      estado_contrato:
        | "generado"
        | "firmado"
        | "en_ejecucion"
        | "completado"
        | "cancelado"
      estado_expediente:
        | "nuevo"
        | "en_estimacion"
        | "estimado"
        | "en_oferta"
        | "adjudicado"
        | "contratado"
        | "cancelado"
      estado_oferta: "pendiente" | "aceptada" | "rechazada"
      proveedor_auth: "email" | "google"
      rol_usuario: "cliente" | "estimador" | "constructor" | "administrador"
      tipo_archivo: "foto" | "video" | "documento" | "contrato_pdf"
      tipo_inmueble:
        | "casa"
        | "apartamento"
        | "edificio"
        | "local_comercial"
        | "otro"
      tipo_servicio:
        | "descontaminacion_moho"
        | "desamiantado"
        | "danos_por_agua"
        | "demolicion_interior"
        | "aislamiento"
        | "fundacion_dren_frances"
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

// ── Aliases de conveniencia ───────────────────────────────────────────────────
// Uso: DbArchivo, DbExpediente, etc. en lugar de Tables<'archivo'>

export type DbArchivo      = Tables<'archivo'>
export type DbContrato     = Tables<'contrato'>
export type DbEstimacion   = Tables<'estimacion'>
export type DbExpediente   = Tables<'expediente'>
export type DbLocalizacion = Tables<'localizacion'>
export type DbOferta       = Tables<'oferta'>
export type DbPerfil       = Tables<'perfil'>
export type DbServicio     = Tables<'servicio'>

// ── Aliases de Enums ──────────────────────────────────────────────────────────
export type EstadoExpediente = Enums<'estado_expediente'>
export type EstadoOferta     = Enums<'estado_oferta'>
export type EstadoContrato   = Enums<'estado_contrato'>
export type RolUsuario       = Enums<'rol_usuario'>
export type TipoArchivo      = Enums<'tipo_archivo'>
export type TipoInmueble     = Enums<'tipo_inmueble'>
export type TipoServicio     = Enums<'tipo_servicio'>
export type ProveedorAuth    = Enums<'proveedor_auth'>
