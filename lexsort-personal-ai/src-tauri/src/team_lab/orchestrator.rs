use anyhow::Result;
use crate::team_lab::ticket::{Platform, Ticket, TicketStatus};

pub struct Orchestrator {
    pub tickets: Vec<Ticket>,
}

impl Orchestrator {
    pub fn new() -> Self {
        Self { tickets: Vec::new() }
    }

    pub fn decompose_spec(&mut self, title: &str, description: &str, platforms: &[Platform]) -> Vec<&Ticket> {
        let mut created = Vec::new();
        for platform in platforms {
            let platform_label = match platform {
                Platform::All => "all",
                Platform::Windows => "windows",
                Platform::Macos => "macos",
                Platform::Linux => "linux",
                Platform::React => "react",
                Platform::Rust => "rust",
                Platform::Python => "python",
            };
            let ticket = Ticket::new(
                format!("[{}] {}", platform_label, title),
                format!("{}\n\nPlatform: {}", description, platform_label),
                platform.clone(),
            );
            self.tickets.push(ticket);
        }
        for t in &self.tickets {
            created.push(t);
        }
        created
    }

    pub fn claim_ticket(&mut self, ticket_id: &str, machine_id: &str) -> Result<()> {
        let ticket = self.tickets
            .iter_mut()
            .find(|t| t.id == ticket_id)
            .ok_or_else(|| anyhow::anyhow!("Ticket not found: {}", ticket_id))?;

        if ticket.status != TicketStatus::Open {
            anyhow::bail!("Ticket {} is not open (status: {:?})", ticket_id, ticket.status);
        }

        ticket.status = TicketStatus::Claimed;
        ticket.claimed_by = Some(machine_id.to_string());
        ticket.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    }

    pub fn start_work(&mut self, ticket_id: &str) -> Result<()> {
        let ticket = self.tickets
            .iter_mut()
            .find(|t| t.id == ticket_id)
            .ok_or_else(|| anyhow::anyhow!("Ticket not found: {}", ticket_id))?;

        if ticket.status != TicketStatus::Claimed {
            anyhow::bail!("Ticket {} is not claimed (status: {:?})", ticket_id, ticket.status);
        }

        ticket.status = TicketStatus::InProgress;
        ticket.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    }

    pub fn complete_ticket(&mut self, ticket_id: &str) -> Result<()> {
        let ticket = self.tickets
            .iter_mut()
            .find(|t| t.id == ticket_id)
            .ok_or_else(|| anyhow::anyhow!("Ticket not found: {}", ticket_id))?;

        ticket.status = TicketStatus::Done;
        ticket.updated_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    }

    pub fn tickets_by_status(&self, status: TicketStatus) -> Vec<&Ticket> {
        self.tickets.iter().filter(|t| t.status == status).collect()
    }
}
