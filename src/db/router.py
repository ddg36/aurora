from .routes.usuarios import UsuariosController
from .routes.chats import ChatsController
from .routes.prompts import PromptsController
from .routes.builder_templates import BuilderTemplatesController
from .routes.team_roles import TeamRolesController
from .routes.creativity_ideas import CreativityIdeasController
from .routes.ajustes import AjustesController
from .routes.stats import StatsController
from .routes.llm import LlmController
from .routes.urls_custom import UrlsCustomController
from .routes.nav import NavController
from .routes.wiki import WikiController
from .routes.scratchpad import ScratchpadController
from .routes.sesiones import SesionesController
from .routes.tokens import TokensController
from .routes.eventos import EventosController
from .routes.ash import AshController
from .routes.bc import BcController
from .routes.yt import YtController
from .routes.backup import BackupController
from .routes.extensions import ExtensionsController
from .routes.ext_capturas import ExtCapturasController
from .routes.jobs import JobsController
from .routes.mdreader import MDReaderController
from .routes.productividad import ProductividadController
from .routes.search import SearchController

ALL_CONTROLLERS = [
    UsuariosController,
    ChatsController,
    PromptsController,
    BuilderTemplatesController,
    TeamRolesController,
    CreativityIdeasController,
    AjustesController,
    StatsController,
    LlmController,
    UrlsCustomController,
    NavController,
    WikiController,
    ScratchpadController,
    SesionesController,
    TokensController,
    EventosController,
    AshController,
    BcController,
    YtController,
    BackupController,
    ExtensionsController,
    ExtCapturasController,
    JobsController,
    MDReaderController,
    ProductividadController,
    SearchController,
]
