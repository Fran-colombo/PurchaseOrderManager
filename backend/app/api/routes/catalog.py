from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_or_404, require_sysadmin
from app.core.database import get_db
from app.core.errors import AppError
from app.models import (
    Certificate,
    CertificateItem,
    Client,
    ContractScope,
    Payment,
    Project,
    PurchaseOrder,
    PurchaseOrderItem,
    UnitOfMeasure,
    User,
)
from app.models.enums import UserRole
from app.schemas.inputs import (
    ClientIn,
    ClientUpdate,
    PoItemIn,
    ProjectIn,
    ProjectUpdate,
    PurchaseOrderIn,
    PurchaseOrderUpdate,
    ScopeIn,
)
from app.services.audit import write_audit
from app.services.calculations import line_amount
from app.services.ledger import certified_quantity
from app.services.money import D
from app.services.presenters import client_out, po_item_out, project_out, purchase_order_out, scope_out
from app.services.workflow import apply_purchase_order_changes

router = APIRouter(tags=["registros"])


def _page(query, page: int, page_size: int):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return rows, total, page, page_size


@router.get("/units")
def list_units(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [{"id": unit.id, "code": unit.code, "name": unit.name, "is_active": unit.is_active} for unit in db.query(UnitOfMeasure).all()]


@router.post("/units")
def create_unit(code: str, name: str, db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    unit = UnitOfMeasure(code=code, name=name, is_active=True)
    db.add(unit)
    db.flush()
    write_audit(db, user, "unit", unit.id, "crear")
    return {"id": unit.id, "code": unit.code, "name": unit.name}


@router.get("/clients")
def list_clients(q: str = "", status: str = "", page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Client)
    if q:
        query = query.filter(Client.legal_name.ilike(f"%{q}%") | Client.trade_name.ilike(f"%{q}%") | Client.cuit.ilike(f"%{q}%"))
    if status:
        query = query.filter(Client.status == status)
    rows, total, page, page_size = _page(query.order_by(Client.legal_name), page, page_size)
    return {"items": [client_out(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/clients")
def create_client(data: ClientIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payload = data.model_dump()
    if not payload.get("cuit"):
        payload["cuit"] = None
    client = Client(**payload)
    db.add(client)
    db.flush()
    write_audit(db, user, "client", client.id, "crear", new={"legal_name": client.legal_name})
    return client_out(client)


@router.get("/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return client_out(get_or_404(db, Client, client_id, "No se encontró el cliente."))


@router.put("/clients/{client_id}")
def update_client(client_id: int, data: ClientUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    client = get_or_404(db, Client, client_id, "No se encontró el cliente.")
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "cuit" and not value:
            value = None
        setattr(client, key, value)
    write_audit(db, user, "client", client.id, "editar")
    return client_out(client)


@router.delete("/clients/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db), user: User = Depends(require_sysadmin)):
    client = get_or_404(db, Client, client_id, "No se encontró el cliente.")
    blockers = []
    if client.projects:
        blockers.append(f"{len(client.projects)} obras")
    if client.purchase_orders:
        blockers.append(f"{len(client.purchase_orders)} órdenes")
    payments = db.query(Payment).filter(Payment.client_id == client.id).count()
    if payments:
        blockers.append(f"{payments} pagos")
    if blockers:
        raise AppError("No se puede eliminar el cliente porque tiene " + ", ".join(blockers) + ".", 409, "has_dependencies")
    db.delete(client)
    write_audit(db, user, "client", client_id, "eliminar")
    return {"ok": True}


@router.get("/projects")
def list_projects(q: str = "", client_id: int | None = None, status: str = "", page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(Project)
    if q:
        query = query.filter(Project.name.ilike(f"%{q}%") | Project.internal_code.ilike(f"%{q}%"))
    if client_id:
        query = query.filter(Project.client_id == client_id)
    if status:
        query = query.filter(Project.status == status)
    rows, total, page, page_size = _page(query.order_by(Project.name), page, page_size)
    return {"items": [project_out(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/projects")
def create_project(data: ProjectIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_or_404(db, Client, data.client_id, "No se encontró el cliente.")
    project = Project(**data.model_dump())
    db.add(project)
    db.flush()
    write_audit(db, user, "project", project.id, "crear", new={"name": project.name})
    return project_out(project)


@router.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    project = get_or_404(db, Project, project_id, "No se encontró la obra.")
    orders = [purchase_order_out(db, po, with_items=False) for po in project.purchase_orders]
    certificates = db.query(Certificate).filter(Certificate.project_id == project.id).count()
    return {**project_out(project), "purchase_orders": orders, "certificate_count": certificates}


@router.put("/projects/{project_id}")
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = get_or_404(db, Project, project_id, "No se encontró la obra.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    write_audit(db, user, "project", project.id, "editar")
    return project_out(project)


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    project = get_or_404(db, Project, project_id, "No se encontró la obra.")
    if project.purchase_orders:
        raise AppError("La obra tiene órdenes de compra. Resolvé esas relaciones antes de eliminarla.", 409, "has_dependencies")
    db.delete(project)
    return {"ok": True}


@router.get("/purchase-orders")
def list_orders(q: str = "", client_id: int | None = None, project_id: int | None = None, status: str = "", page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(PurchaseOrder)
    if q:
        query = query.filter(PurchaseOrder.client_po_number.ilike(f"%{q}%"))
    if client_id:
        query = query.filter(PurchaseOrder.client_id == client_id)
    if project_id:
        query = query.filter(PurchaseOrder.project_id == project_id)
    if status:
        query = query.filter(PurchaseOrder.status == status)
    rows, total, page, page_size = _page(query.order_by(PurchaseOrder.id.desc()), page, page_size)
    return {"items": [purchase_order_out(db, row) for row in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/purchase-orders")
def create_order(data: PurchaseOrderIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    client = get_or_404(db, Client, data.client_id, "No se encontró el cliente.")
    project = get_or_404(db, Project, data.project_id, "No se encontró la obra.")
    if project.client_id != client.id:
        raise AppError("La obra no pertenece a ese cliente.", code="invalid_relation")
    payload = data.model_dump()
    order = PurchaseOrder(**payload)
    db.add(order)
    db.flush()
    write_audit(db, user, "purchase_order", order.id, "crear", new={"number": order.client_po_number})
    return purchase_order_out(db, order, with_items=True)


@router.get("/purchase-orders/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    order = get_or_404(db, PurchaseOrder, order_id, "No se encontró la orden de compra.")
    return purchase_order_out(db, order, with_items=True)


@router.put("/purchase-orders/{order_id}")
def update_order(order_id: int, data: PurchaseOrderUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    order = get_or_404(db, PurchaseOrder, order_id, "No se encontró la orden de compra.")
    return purchase_order_out(db, apply_purchase_order_changes(db, user, order, data.model_dump(exclude_unset=True)), with_items=True)


@router.delete("/purchase-orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db), _: User = Depends(require_sysadmin)):
    order = get_or_404(db, PurchaseOrder, order_id, "No se encontró la orden de compra.")
    if order.certificates:
        raise AppError("La orden tiene certificados. Anulalos o conservá la orden.", 409, "has_dependencies")
    db.delete(order)
    return {"ok": True}


@router.post("/purchase-orders/{order_id}/items")
def add_item(order_id: int, data: PoItemIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    order = get_or_404(db, PurchaseOrder, order_id, "No se encontró la orden de compra.")
    item = PurchaseOrderItem(
        purchase_order_id=order.id,
        description=data.description,
        sector=data.sector,
        unit_id=data.unit_id,
        scope_id=data.scope_id,
        contracted_quantity=data.contracted_quantity,
        unit_price=data.unit_price,
        original_amount=line_amount(data.contracted_quantity, data.unit_price),
        status=data.status,
        sort_order=data.sort_order,
    )
    db.add(item)
    db.flush()
    write_audit(db, user, "purchase_order_item", item.id, "crear", new={"description": item.description, "amount": str(item.original_amount)})
    return po_item_out(db, item)


@router.put("/purchase-orders/{order_id}/items/{item_id}")
def update_item(order_id: int, item_id: int, data: PoItemIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = get_or_404(db, PurchaseOrderItem, item_id, "No se encontró el rubro.")
    if item.purchase_order_id != order_id:
        raise AppError("El rubro no pertenece a esa orden.", code="invalid_relation")
    certified = certified_quantity(db, item.id)
    if D(data.contracted_quantity) + D("0.0001") < certified and not data.allow_overage:
        raise AppError(
            "La cantidad contratada quedaría por debajo de lo ya certificado. Confirmá el excedente si corresponde.",
            409,
            "overage",
        )
    item.description = data.description
    item.sector = data.sector
    item.unit_id = data.unit_id
    item.scope_id = data.scope_id
    item.contracted_quantity = data.contracted_quantity
    item.unit_price = data.unit_price
    item.original_amount = line_amount(data.contracted_quantity, data.unit_price)
    item.status = data.status
    item.sort_order = data.sort_order
    write_audit(db, user, "purchase_order_item", item.id, "editar", new={"original_amount": str(item.original_amount)})
    return po_item_out(db, item)


@router.delete("/purchase-orders/{order_id}/items/{item_id}")
def delete_item(order_id: int, item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != UserRole.SYSADMIN.value:
        raise AppError("Solo un administrador puede eliminar un rubro.", 403, "forbidden")
    item = get_or_404(db, PurchaseOrderItem, item_id, "No se encontró el rubro.")
    used = db.query(CertificateItem).filter(CertificateItem.po_item_id == item.id).count()
    if used:
        raise AppError("El rubro ya fue certificado. No se puede borrar sin perder la historia.", 409, "has_dependencies")
    db.delete(item)
    return {"ok": True}


@router.post("/purchase-orders/{order_id}/scopes")
def add_scope(order_id: int, data: ScopeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_or_404(db, PurchaseOrder, order_id, "No se encontró la orden de compra.")
    scope = ContractScope(purchase_order_id=order_id, name=data.name, description=data.description)
    db.add(scope)
    db.flush()
    write_audit(db, user, "scope", scope.id, "crear")
    return scope_out(scope)
