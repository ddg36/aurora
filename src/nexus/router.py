from .approvals import APPROVAL_ROUTES
from .editor import EDITOR_ROUTES
from .fs import FS_ROUTES
from .py import PY_ROUTES
from .shell import SHELL_ROUTES
from .tasks import TASKS_ROUTES

NEXUS_ROUTES = FS_ROUTES + SHELL_ROUTES + PY_ROUTES + EDITOR_ROUTES + APPROVAL_ROUTES + TASKS_ROUTES
