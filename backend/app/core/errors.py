class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400, code: str = "error", details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}
