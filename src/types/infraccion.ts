export interface Infraccion {
  codigo: string;
  categoriaId: string;
  nombre: string;
  descripcion: string;
  gravedad: 'leve' | 'moderada' | 'grave' | 'critica';
  reglaRelacionada: string;
  multaBase: number;
}
