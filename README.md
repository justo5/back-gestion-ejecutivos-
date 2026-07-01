erDiagram
    USERS {
        uuid id PK
        string email
        string passwordHash
        enum role
        string name
        uuid executiveId FK
        timestamptz createdAt
    }

    EXECUTIVES {
        uuid id PK
        string name
        string imageUrl
        string squad
        timestamptz createdAt
    }

    CLIENTS {
        uuid id PK
        uuid executiveId FK
        string name
        boolean active
        date contactDay
        jsonb data
        timestamptz createdAt
    }

    PLANS {
        int id PK
        string name
        numeric price
    }

    COBROS {
        uuid id PK
        uuid clientId FK
        int planId FK
        enum collectedBy
        boolean paid
        timestamptz updatedAt
    }

    EXECUTIVES ||--o{ USERS : "executiveId (nullable)"
    EXECUTIVES ||--o{ CLIENTS : "executiveId"
    CLIENTS ||--|| COBROS : "clientId"
    PLANS ||--o{ COBROS : "planId (nullable)"