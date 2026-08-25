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
      asistente_conversacion: {
        Row: {
          content: string
          creado_en: string
          expediente_id: string
          id: string
          role: string
          usuario_id: string
        }
        Insert: {
          content: string
          creado_en?: string
          expediente_id: string
          id?: string
          role: string
          usuario_id: string
        }
        Update: {
          content?: string
          creado_en?: string
          expediente_id?: string
          id?: string
          role?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistente_conversacion_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistente_conversacion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          }
        ]
      }
      asistente_evento: {
        Row: {
          creado_en: string
          expediente_id: string
          id: string
          payload: Json
          resuelto: boolean
          resumen: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          tipo: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          expediente_id: string
          id?: string
          payload?: Json
          resuelto?: boolean
          resumen: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          tipo: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          expediente_id?: string
          id?: string
          payload?: Json
          resuelto?: boolean
          resumen?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistente_evento_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistente_evento_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      ficha_normativa: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          id: number
          orden: number
          palabras_clave: string[]
          resumen_en: string
          resumen_es: string
          resumen_fr: string
          titulo_en: string
          titulo_es: string
          titulo_fr: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          id?: number
          orden?: number
          palabras_clave?: string[]
          resumen_en: string
          resumen_es: string
          resumen_fr: string
          titulo_en: string
          titulo_es: string
          titulo_fr: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          id?: number
          orden?: number
          palabras_clave?: string[]
          resumen_en?: string
          resumen_es?: string
          resumen_fr?: string
          titulo_en?: string
          titulo_es?: string
          titulo_fr?: string
        }
        Relationships: []
      }
      imprevisto_catalogo: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          ficha_codigo: string | null
          id: number
          orden: number
          perfil_en: string
          perfil_es: string
          perfil_fr: string
          protocolo_en: string
          protocolo_es: string
          protocolo_fr: string
          requiere_aprobacion: boolean
          servicio_id: number | null
          titulo_en: string
          titulo_es: string
          titulo_fr: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          ficha_codigo?: string | null
          id?: number
          orden?: number
          perfil_en: string
          perfil_es: string
          perfil_fr: string
          protocolo_en: string
          protocolo_es: string
          protocolo_fr: string
          requiere_aprobacion?: boolean
          servicio_id?: number | null
          titulo_en: string
          titulo_es: string
          titulo_fr: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          ficha_codigo?: string | null
          id?: number
          orden?: number
          perfil_en?: string
          perfil_es?: string
          perfil_fr?: string
          protocolo_en?: string
          protocolo_es?: string
          protocolo_fr?: string
          requiere_aprobacion?: boolean
          servicio_id?: number | null
          titulo_en?: string
          titulo_es?: string
          titulo_fr?: string
        }
        Relationships: [
          {
            foreignKeyName: "imprevisto_catalogo_ficha_codigo_fkey"
            columns: ["ficha_codigo"]
            isOneToOne: false
            referencedRelation: "ficha_normativa"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "imprevisto_catalogo_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      actividad_servicio: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          fase_id: string | null
          id: string
          nombre_en: string
          nombre_es: string
          nombre_fr: string
          servicio_id: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          fase_id?: string | null
          id?: string
          nombre_en: string
          nombre_es: string
          nombre_fr: string
          servicio_id: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          fase_id?: string | null
          id?: string
          nombre_en?: string
          nombre_es?: string
          nombre_fr?: string
          servicio_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "actividad_servicio_fase_id_fkey"
            columns: ["fase_id"]
            isOneToOne: false
            referencedRelation: "fase_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividad_servicio_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      archivo: {
        Row: {
          creado_en: string
          estimacion_id: string | null
          expediente_id: string | null
          id: string
          mime_type: string
          nombre_archivo: string
          oferta_id: string | null
          reporte_id: string | null
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
          reporte_id?: string | null
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
          reporte_id?: string | null
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
            foreignKeyName: "archivo_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reporte_diario"
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
          creado_por: string | null
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
          creado_por?: string | null
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
          creado_por?: string | null
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
            foreignKeyName: "expediente_creado_por_fkey"
            columns: ["creado_por"]
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
      expediente_invitacion: {
        Row: {
          constructor_id: string
          enviado_en: string
          expediente_id: string
          id: string
          invitado_por: string | null
        }
        Insert: {
          constructor_id: string
          enviado_en?: string
          expediente_id: string
          id?: string
          invitado_por?: string | null
        }
        Update: {
          constructor_id?: string
          enviado_en?: string
          expediente_id?: string
          id?: string
          invitado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_invitacion_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_invitacion_constructor_id_fkey"
            columns: ["constructor_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_invitacion_invitado_por_fkey"
            columns: ["invitado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      fase_servicio: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          descripcion_en: string | null
          descripcion_es: string | null
          descripcion_fr: string | null
          id: string
          nombre_en: string
          nombre_es: string
          nombre_fr: string
          orden: number
          servicio_id: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          descripcion_en?: string | null
          descripcion_es?: string | null
          descripcion_fr?: string | null
          id?: string
          nombre_en: string
          nombre_es: string
          nombre_fr: string
          orden: number
          servicio_id: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          descripcion_en?: string | null
          descripcion_es?: string | null
          descripcion_fr?: string | null
          id?: string
          nombre_en?: string
          nombre_es?: string
          nombre_fr?: string
          orden?: number
          servicio_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fase_servicio_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      inspeccion: {
        Row: {
          actualizado_en: string
          creado_en: string
          creado_por: string
          estado: Database["public"]["Enums"]["estado_inspeccion"]
          fecha: string
          hora: string
          id: string
          motivo: string | null
          seguimiento_id: string
          tipo_visitante: Database["public"]["Enums"]["tipo_visitante"]
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por: string
          estado?: Database["public"]["Enums"]["estado_inspeccion"]
          fecha: string
          hora: string
          id?: string
          motivo?: string | null
          seguimiento_id: string
          tipo_visitante: Database["public"]["Enums"]["tipo_visitante"]
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string
          estado?: Database["public"]["Enums"]["estado_inspeccion"]
          fecha?: string
          hora?: string
          id?: string
          motivo?: string | null
          seguimiento_id?: string
          tipo_visitante?: Database["public"]["Enums"]["tipo_visitante"]
        }
        Relationships: [
          {
            foreignKeyName: "inspeccion_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspeccion_seguimiento_id_fkey"
            columns: ["seguimiento_id"]
            isOneToOne: false
            referencedRelation: "seguimiento_obra"
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
      matterport_modelo: {
        Row: {
          alto_m: number | null
          ancho_m: number | null
          area_pared_m2: number | null
          area_piso_ft2: number | null
          area_piso_interior_ft2: number | null
          area_piso_interior_m2: number | null
          area_piso_m2: number | null
          area_techo_m2: number | null
          calle: string | null
          ciudad: string | null
          codigo_postal: string | null
          creado_en: string
          creado_matterport: string | null
          datos_crudos: Json | null
          descripcion: string | null
          direccion: string | null
          estado: string | null
          expediente_id: string
          habitaciones: Json
          id: string
          imagen_url: string | null
          latitud: number | null
          longitud: number | null
          model_id: string
          modificado_matterport: string | null
          nombre: string | null
          pais: string | null
          pisos: Json
          profundidad_m: number | null
          publicado: boolean | null
          region: string | null
          resumen_publico: string | null
          share_url: string | null
          sincronizado_en: string
          sincronizado_por: string | null
          total_habitaciones: number | null
          total_pisos: number | null
          url_tour: string
          visibilidad: string | null
          volumen_m3: number | null
        }
        Insert: {
          alto_m?: number | null
          ancho_m?: number | null
          area_pared_m2?: number | null
          area_piso_ft2?: number | null
          area_piso_interior_ft2?: number | null
          area_piso_interior_m2?: number | null
          area_piso_m2?: number | null
          area_techo_m2?: number | null
          calle?: string | null
          ciudad?: string | null
          codigo_postal?: string | null
          creado_en?: string
          creado_matterport?: string | null
          datos_crudos?: Json | null
          descripcion?: string | null
          direccion?: string | null
          estado?: string | null
          expediente_id: string
          habitaciones?: Json
          id?: string
          imagen_url?: string | null
          latitud?: number | null
          longitud?: number | null
          model_id: string
          modificado_matterport?: string | null
          nombre?: string | null
          pais?: string | null
          pisos?: Json
          profundidad_m?: number | null
          publicado?: boolean | null
          region?: string | null
          resumen_publico?: string | null
          share_url?: string | null
          sincronizado_en?: string
          sincronizado_por?: string | null
          total_habitaciones?: number | null
          total_pisos?: number | null
          url_tour: string
          visibilidad?: string | null
          volumen_m3?: number | null
        }
        Update: {
          alto_m?: number | null
          ancho_m?: number | null
          area_pared_m2?: number | null
          area_piso_ft2?: number | null
          area_piso_interior_ft2?: number | null
          area_piso_interior_m2?: number | null
          area_piso_m2?: number | null
          area_techo_m2?: number | null
          calle?: string | null
          ciudad?: string | null
          codigo_postal?: string | null
          creado_en?: string
          creado_matterport?: string | null
          datos_crudos?: Json | null
          descripcion?: string | null
          direccion?: string | null
          estado?: string | null
          expediente_id?: string
          habitaciones?: Json
          id?: string
          imagen_url?: string | null
          latitud?: number | null
          longitud?: number | null
          model_id?: string
          modificado_matterport?: string | null
          nombre?: string | null
          pais?: string | null
          pisos?: Json
          profundidad_m?: number | null
          publicado?: boolean | null
          region?: string | null
          resumen_publico?: string | null
          share_url?: string | null
          sincronizado_en?: string
          sincronizado_por?: string | null
          total_habitaciones?: number | null
          total_pisos?: number | null
          url_tour?: string
          visibilidad?: string | null
          volumen_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matterport_modelo_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matterport_modelo_sincronizado_por_fkey"
            columns: ["sincronizado_por"]
            isOneToOne: false
            referencedRelation: "perfil"
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
          compania_direccion: string | null
          compania_email: string | null
          compania_nombre: string | null
          compania_telefono: string | null
          rbq: string | null
          especialidad_id: number | null
          especialidad_todas: boolean
          anios_experiencia: number | null
          zona_servicio: string | null
          mensaje: string | null
          direccion_unidad: string | null
          direccion_calle: string | null
          direccion_ciudad: string | null
          direccion_provincia: string | null
          direccion_codigo_postal: string | null
          idioma: string
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
          compania_direccion?: string | null
          compania_email?: string | null
          compania_nombre?: string | null
          compania_telefono?: string | null
          rbq?: string | null
          especialidad_id?: number | null
          especialidad_todas?: boolean
          anios_experiencia?: number | null
          zona_servicio?: string | null
          mensaje?: string | null
          direccion_unidad?: string | null
          direccion_calle?: string | null
          direccion_ciudad?: string | null
          direccion_provincia?: string | null
          direccion_codigo_postal?: string | null
          idioma?: string
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
          compania_direccion?: string | null
          compania_email?: string | null
          compania_nombre?: string | null
          compania_telefono?: string | null
          rbq?: string | null
          especialidad_id?: number | null
          especialidad_todas?: boolean
          anios_experiencia?: number | null
          zona_servicio?: string | null
          mensaje?: string | null
          direccion_unidad?: string | null
          direccion_calle?: string | null
          direccion_ciudad?: string | null
          direccion_provincia?: string | null
          direccion_codigo_postal?: string | null
          idioma?: string
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
        Relationships: [
          {
            foreignKeyName: "perfil_especialidad_id_fkey"
            columns: ["especialidad_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_especialidad: {
        Row: {
          creado_en: string
          perfil_id: string
          servicio_id: number
        }
        Insert: {
          creado_en?: string
          perfil_id: string
          servicio_id: number
        }
        Update: {
          creado_en?: string
          perfil_id?: string
          servicio_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "perfil_especialidad_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_especialidad_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      reporte_actividad: {
        Row: {
          actividad_id: string
          creado_en: string
          id: string
          reporte_id: string
        }
        Insert: {
          actividad_id: string
          creado_en?: string
          id?: string
          reporte_id: string
        }
        Update: {
          actividad_id?: string
          creado_en?: string
          id?: string
          reporte_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporte_actividad_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividad_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporte_actividad_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reporte_diario"
            referencedColumns: ["id"]
          },
        ]
      }
      reporte_diario: {
        Row: {
          actualizado_en: string
          constructor_id: string
          creado_en: string
          descripcion: string | null
          fase_id: string | null
          fecha: string
          hora_fin: string | null
          hora_inicio: string
          horas_trabajadas: number
          id: string
          porcentaje_acumulado: number | null
          porcentaje_avance_dia: number
          seguimiento_id: string
        }
        Insert: {
          actualizado_en?: string
          constructor_id: string
          creado_en?: string
          descripcion?: string | null
          fase_id?: string | null
          fecha: string
          hora_fin?: string | null
          hora_inicio?: string
          horas_trabajadas?: number
          id?: string
          porcentaje_acumulado?: number | null
          porcentaje_avance_dia?: number
          seguimiento_id: string
        }
        Update: {
          actualizado_en?: string
          constructor_id?: string
          creado_en?: string
          descripcion?: string | null
          fase_id?: string | null
          fecha?: string
          hora_fin?: string | null
          hora_inicio?: string
          horas_trabajadas?: number
          id?: string
          porcentaje_acumulado?: number | null
          porcentaje_avance_dia?: number
          seguimiento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporte_diario_constructor_id_fkey"
            columns: ["constructor_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporte_diario_fase_id_fkey"
            columns: ["fase_id"]
            isOneToOne: false
            referencedRelation: "fase_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reporte_diario_seguimiento_id_fkey"
            columns: ["seguimiento_id"]
            isOneToOne: false
            referencedRelation: "seguimiento_obra"
            referencedColumns: ["id"]
          },
        ]
      }
      reporte_zona: {
        Row: {
          creado_en: string
          descripcion: string | null
          id: string
          porcentaje_avance: number | null
          reporte_id: string
          zona: string
        }
        Insert: {
          creado_en?: string
          descripcion?: string | null
          id?: string
          porcentaje_avance?: number | null
          reporte_id: string
          zona: string
        }
        Update: {
          creado_en?: string
          descripcion?: string | null
          id?: string
          porcentaje_avance?: number | null
          reporte_id?: string
          zona?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporte_zona_reporte_id_fkey"
            columns: ["reporte_id"]
            isOneToOne: false
            referencedRelation: "reporte_diario"
            referencedColumns: ["id"]
          },
        ]
      }
      seguimiento_obra: {
        Row: {
          actualizado_en: string
          constructor_id: string
          contrato_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_seguimiento"]
          expediente_id: string
          fase_actual_id: string | null
          fecha_fin_real: string | null
          fecha_inicio_real: string | null
          id: string
          porcentaje_avance: number
        }
        Insert: {
          actualizado_en?: string
          constructor_id: string
          contrato_id: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_seguimiento"]
          expediente_id: string
          fase_actual_id?: string | null
          fecha_fin_real?: string | null
          fecha_inicio_real?: string | null
          id?: string
          porcentaje_avance?: number
        }
        Update: {
          actualizado_en?: string
          constructor_id?: string
          contrato_id?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_seguimiento"]
          expediente_id?: string
          fase_actual_id?: string | null
          fecha_fin_real?: string | null
          fecha_inicio_real?: string | null
          id?: string
          porcentaje_avance?: number
        }
        Relationships: [
          {
            foreignKeyName: "seguimiento_obra_constructor_id_fkey"
            columns: ["constructor_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_obra_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: true
            referencedRelation: "contrato"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_obra_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seguimiento_obra_fase_actual_id_fkey"
            columns: ["fase_actual_id"]
            isOneToOne: false
            referencedRelation: "fase_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      servicio: {
        Row: {
          activo: boolean
          codigo: string
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
          codigo: string
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
          codigo?: string
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
      expediente_busqueda: {
        Row: {
          busqueda_texto: string | null
          canton: string | null
          cliente_id: string | null
          creado_en: string | null
          creado_por: string | null
          descripcion: string | null
          direccion: string | null
          distrito: string | null
          estado: Database["public"]["Enums"]["estado_expediente"] | null
          estimador_id: string | null
          fecha_visita: string | null
          id: string | null
          numero: string | null
          provincia: string | null
          servicio_id: number | null
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
            foreignKeyName: "expediente_creado_por_fkey"
            columns: ["creado_por"]
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
      firmar_contrato: { Args: { p_contrato_id: string }; Returns: undefined }
      firmar_contrato_admin: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      fn_rol_actual: { Args: never; Returns: string }
      get_rol_usuario: { Args: never; Returns: string }
      iniciar_ejecucion_contrato: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      iniciar_ejecucion_contrato_admin: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      marcar_contratado: {
        Args: { p_expediente_id: string }
        Returns: undefined
      }
      mi_rol: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      recalcular_avance_seguimiento: {
        Args: { p_seguimiento_id: string }
        Returns: undefined
      }
      rechazar_oferta: {
        Args: { p_expediente_id: string; p_oferta_id: string }
        Returns: undefined
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
      estado_inspeccion: "programada" | "realizada" | "cancelada"
      estado_oferta: "pendiente" | "aceptada" | "rechazada"
      estado_seguimiento:
        | "no_iniciado"
        | "en_progreso"
        | "pausado"
        | "completado"
      proveedor_auth: "email" | "google"
      rol_usuario: "cliente" | "estimador" | "constructor" | "administrador"
      tipo_archivo:
        | "foto"
        | "video"
        | "documento"
        | "contrato_pdf"
        | "reporte_foto"
        | "reporte_video"
        | "reporte_documento"
      tipo_inmueble:
        | "casa"
        | "apartamento"
        | "edificio"
        | "local_comercial"
        | "otro"
      tipo_visitante: "inspector" | "dueno" | "estimador"
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

// ── Aliases de conveniencia usados en todo el proyecto ────────────────────────
export type DbPerfil        = Database["public"]["Tables"]["perfil"]["Row"]
export type RolUsuario      = Database["public"]["Enums"]["rol_usuario"]
export type ProveedorAuth   = Database["public"]["Enums"]["proveedor_auth"]
export type EstadoExpediente= Database["public"]["Enums"]["estado_expediente"]
export type EstadoOferta    = Database["public"]["Enums"]["estado_oferta"]
export type EstadoContrato  = Database["public"]["Enums"]["estado_contrato"]
export type TipoInmueble    = Database["public"]["Enums"]["tipo_inmueble"]
export type TipoArchivo     = Database["public"]["Enums"]["tipo_archivo"]
export type TipoServicio    = string
export type EstadoSeguimiento = Database["public"]["Enums"]["estado_seguimiento"]

export const Constants = {
  public: {
    Enums: {
      estado_contrato: [
        "generado",
        "firmado",
        "en_ejecucion",
        "completado",
        "cancelado",
      ],
      estado_expediente: [
        "nuevo",
        "en_estimacion",
        "estimado",
        "en_oferta",
        "adjudicado",
        "contratado",
        "cancelado",
      ],
      estado_inspeccion: ["programada", "realizada", "cancelada"],
      estado_oferta: ["pendiente", "aceptada", "rechazada"],
      estado_seguimiento: [
        "no_iniciado",
        "en_progreso",
        "pausado",
        "completado",
      ],
      proveedor_auth: ["email", "google"],
      rol_usuario: ["cliente", "estimador", "constructor", "administrador"],
      tipo_archivo: [
        "foto",
        "video",
        "documento",
        "contrato_pdf",
        "reporte_foto",
        "reporte_video",
        "reporte_documento",
      ],
      tipo_inmueble: [
        "casa",
        "apartamento",
        "edificio",
        "local_comercial",
        "otro",
      ],
      tipo_visitante: ["inspector", "dueno", "estimador"],
    },
  },
} as const
