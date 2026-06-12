package authz

import future.keywords

default allow = false

# Admins have access to everything
allow if {
    input.user.roles[_] == "ADMIN"
}

# Allow if user has a permission that covers the action and resource path
allow if {
    some permission in input.user.permissions
    permission_allows_action_path(permission, input.action, input.path)
}

# Ownership checks (Attribute-Based Access Control)
# A standard user can read/write their own profile if they are the resource owner
allow if {
    some permission in input.user.permissions
    permission == "profile:read"
    input.action == "GET"
    input.path == ["users", "profile"]
    input.user.id == input.resource_owner_id
}

allow if {
    some permission in input.user.permissions
    permission == "profile:write"
    input.action == "PUT"
    input.path == ["users", "profile"]
    input.user.id == input.resource_owner_id
}

# Map permission strings to request actions and path arrays
permission_allows_action_path(permission, action, path) if {
    permission_allows_action_path_rules[permission][action][path]
}

permission_allows_action_path_rules := {
    "policy:read": {
        "GET": {
            ["policies"]: true
        }
    },
    "policy:write": {
        "POST": {
            ["policies"]: true
        },
        "PUT": {
            ["policies"]: true
        },
        "DELETE": {
            ["policies"]: true
        }
    },
    "audit:read": {
        "GET": {
            ["audit"]: true
        }
    },
    "profile:read": {
        "GET": {
            ["profile"]: true
        }
    },
    "profile:write": {
        "POST": {
            ["profile"]: true
        },
        "PUT": {
            ["profile"]: true
        }
    }
}
