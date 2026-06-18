# ══════════════════════════════════════════════════════
#  GEMITA TOOL PROTOCOL — Protocolo para herramientas
#  Define la interfaz estándar que todas las herramientas deben implementar.
#  Permite validación, descubrimiento dinámico y extensibilidad.
# ══════════════════════════════════════════════════════

from abc import ABC, abstractmethod
from typing import Protocol, runtime_checkable, Any, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum


class ToolRisk(Enum):
    """Nivel de riesgo de una herramienta."""
    LOW = "LOW"       # Operaciones seguras (lectura)
    MEDIUM = "MEDIUM" # Operaciones moderadas (escritura controlada)
    HIGH = "HIGH"     # Operaciones críticas (ejecución, eliminación)


class ToolCategory(Enum):
    """Categoría de herramienta."""
    SYSTEM = "system"       # Operaciones del sistema
    FILE = "file"           # Operaciones de archivos
    MEMORY = "memory"       # Operaciones de memoria
    NETWORK = "network"     # Operaciones de red
    BROWSER = "browser"     # Operaciones del navegador
    SHELL = "shell"         # Ejecución de comandos
    CUSTOM = "custom"       # Herramientas personalizadas


@dataclass
class ToolParameter:
    """Definición de un parámetro de herramienta."""
    name: str
    type: str  # "string", "number", "boolean", "object", "array"
    description: str
    required: bool = False
    default: Any = None
    enum: Optional[List[str]] = None  # Para valores enum


@dataclass
class ToolSchema:
    """Schema completo de una herramienta."""
    name: str
    description: str
    category: ToolCategory
    risk: ToolRisk
    parameters: List[ToolParameter]
    requires_auth: bool = False
    timeout: int = 30  # Timeout en segundos


# ── Protocolo para herramientas ─────────────────────────

@runtime_checkable
class Tool(Protocol):
    """Protocolo que todas las herramientas deben implementar."""
    
    # Propiedades estáticas (definidas en la clase)
    name: str
    description: str
    category: ToolCategory
    risk: ToolRisk
    
    def get_schema(self) -> ToolSchema:
        """Retorna el schema completo de la herramienta."""
        ...
    
    async def execute(self, args: Dict[str, Any], context: Dict[str, Any]) -> str:
        """Ejecuta la herramienta con los argumentos dados."""
        ...
    
    def validate_args(self, args: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Valida los argumentos. Retorna (valid, error_message)."""
        ...


# ── Clase base para implementaciones de herramientas ─────

class BaseTool(ABC):
    """Clase base abstracta para implementaciones de herramientas."""
    
    name: str = ""
    description: str = ""
    category: ToolCategory = ToolCategory.CUSTOM
    risk: ToolRisk = ToolRisk.LOW
    timeout: int = 30
    
    def __init__(self):
        self._schema: Optional[ToolSchema] = None
    
    def get_schema(self) -> ToolSchema:
        """Retorna el schema completo de la herramienta."""
        if self._schema is None:
            self._schema = self._build_schema()
        return self._schema
    
    def _build_schema(self) -> ToolSchema:
        """Construye el schema desde los metadatos de la clase."""
        return ToolSchema(
            name=self.name,
            description=self.description,
            category=self.category,
            risk=self.risk,
            parameters=self._get_parameters(),
            timeout=self.timeout
        )
    
    @abstractmethod
    def _get_parameters(self) -> List[ToolParameter]:
        """Retorna la lista de parámetros de la herramienta."""
        ...
    
    @abstractmethod
    async def execute(self, args: Dict[str, Any], context: Dict[str, Any]) -> str:
        """Ejecuta la herramienta."""
        ...
    
    def validate_args(self, args: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Valida los argumentos contra el schema."""
        schema = self.get_schema()
        
        # Verificar parámetros requeridos
        for param in schema.parameters:
            if param.required and param.name not in args:
                return False, f"Parámetro requerido faltante: {param.name}"
        
        # Verificar tipos (básico)
        for param in schema.parameters:
            if param.name in args:
                value = args[param.name]
                if param.enum and value not in param.enum:
                    return False, f"Valor inválido para {param.name}: {value}. Debe ser uno de: {param.enum}"
        
        return True, None


# ── Catálogo de herramientas ───────────────────────────

class ToolCatalog:
    """Catálogo centralizado de herramientas."""
    
    def __init__(self):
        self._tools: Dict[str, Tool] = {}
        self._by_category: Dict[ToolCategory, List[str]] = {}
    
    def register(self, tool: Tool) -> None:
        """Registra una herramienta en el catálogo."""
        if not isinstance(tool, Tool):
            raise TypeError(f"{tool} no implementa el protocolo Tool")
        
        schema = tool.get_schema()
        self._tools[schema.name] = tool
        
        # Indexar por categoría
        if schema.category not in self._by_category:
            self._by_category[schema.category] = []
        self._by_category[schema.category].append(schema.name)
    
    def get(self, name: str) -> Optional[Tool]:
        """Obtiene una herramienta por nombre."""
        return self._tools.get(name)
    
    def get_schema(self, name: str) -> Optional[ToolSchema]:
        """Obtiene el schema de una herramienta."""
        tool = self.get(name)
        return tool.get_schema() if tool else None
    
    def list_all(self) -> List[ToolSchema]:
        """Lista todos los schemas de herramientas."""
        return [tool.get_schema() for tool in self._tools.values()]
    
    def list_by_category(self, category: ToolCategory) -> List[ToolSchema]:
        """Lista herramientas por categoría."""
        names = self._by_category.get(category, [])
        return [self.get_schema(name) for name in names if self.get_schema(name)]
    
    def list_by_risk(self, risk: ToolRisk) -> List[ToolSchema]:
        """Lista herramientas por nivel de riesgo."""
        return [
            schema for schema in self.list_all()
            if schema.risk == risk
        ]
    
    def to_openai_format(self) -> List[Dict]:
        """Convierte el catálogo al formato OpenAI function calling."""
        return [
            {
                "type": "function",
                "function": {
                    "name": schema.name,
                    "description": schema.description,
                    "parameters": {
                        "type": "object",
                        "properties": {
                            param.name: {
                                "type": param.type,
                                "description": param.description
                            }
                            for param in schema.parameters
                        },
                        "required": [
                            param.name for param in schema.parameters if param.required
                        ]
                    }
                }
            }
            for schema in self.list_all()
        ]


# ── Catálogo global singleton ───────────────────────────

_global_catalog: Optional[ToolCatalog] = None


def get_catalog() -> ToolCatalog:
    """Retorna el catálogo global singleton."""
    global _global_catalog
    if _global_catalog is None:
        _global_catalog = ToolCatalog()
    return _global_catalog


def register_tool(tool: Tool) -> None:
    """Registra una herramienta en el catálogo global."""
    get_catalog().register(tool)
