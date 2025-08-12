#!/bin/bash

# Trading Approval System - Management Script
# Simple commands to manage your deployment

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${GREEN}✅ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

show_help() {
    echo "🛠️  Trading Approval System - Management Commands"
    echo "=================================================="
    echo ""
    echo "Usage: ./manage.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start     - Start all services"
    echo "  stop      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  status    - Show service status"
    echo "  logs      - Show application logs (press Ctrl+C to exit)"
    echo "  logs-db   - Show database logs"
    echo "  logs-web  - Show web server logs"
    echo "  update    - Update application (rebuild and restart)"
    echo "  backup    - Create database backup"
    echo "  health    - Check application health"
    echo "  reset     - Stop and remove all data (DANGEROUS!)"
    echo ""
    echo "Examples:"
    echo "  ./manage.sh start"
    echo "  ./manage.sh logs"
    echo "  ./manage.sh health"
}

check_compose() {
    if [[ ! -f "docker-compose.yml" ]]; then
        print_error "docker-compose.yml not found. Are you in the right directory?"
        exit 1
    fi
}

case "$1" in
    "start")
        check_compose
        print_info "Starting Trading Approval System..."
        docker-compose up -d
        print_status "Services started"
        echo ""
        print_info "Waiting for services to be ready..."
        sleep 15
        docker-compose ps
        ;;
        
    "stop")
        check_compose
        print_info "Stopping Trading Approval System..."
        docker-compose down
        print_status "Services stopped"
        ;;
        
    "restart")
        check_compose
        print_info "Restarting Trading Approval System..."
        docker-compose restart
        print_status "Services restarted"
        sleep 10
        docker-compose ps
        ;;
        
    "status")
        check_compose
        print_info "Service Status:"
        docker-compose ps
        echo ""
        print_info "Resource Usage:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker-compose ps -q) 2>/dev/null || echo "No containers running"
        ;;
        
    "logs")
        check_compose
        print_info "Application logs (press Ctrl+C to exit):"
        docker-compose logs -f app
        ;;
        
    "logs-db")
        check_compose
        print_info "Database logs (press Ctrl+C to exit):"
        docker-compose logs -f postgres
        ;;
        
    "logs-web")
        check_compose
        print_info "Web server logs (press Ctrl+C to exit):"
        docker-compose logs -f nginx
        ;;
        
    "update")
        check_compose
        print_info "Updating application..."
        echo "1. Stopping services..."
        docker-compose down
        echo "2. Rebuilding application..."
        docker-compose build app
        echo "3. Starting services..."
        docker-compose up -d
        print_status "Application updated"
        sleep 15
        docker-compose ps
        ;;
        
    "backup")
        check_compose
        if ! docker-compose ps | grep -q postgres; then
            print_error "Database container is not running. Start services first with: ./manage.sh start"
            exit 1
        fi
        
        BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
        print_info "Creating database backup: $BACKUP_FILE"
        
        docker-compose exec -T postgres pg_dump -U trading_user trading_approval > "$BACKUP_FILE"
        
        if [[ $? -eq 0 ]]; then
            print_status "Backup created: $BACKUP_FILE"
        else
            print_error "Backup failed"
            exit 1
        fi
        ;;
        
    "health")
        check_compose
        
        # Load environment variables
        if [[ -f ".env" ]]; then
            source .env
        fi
        
        HTTPS_PORT=${HTTPS_PORT:-8443}
        
        print_info "Checking application health..."
        
        # Check if containers are running
        if ! docker-compose ps | grep -q "Up"; then
            print_error "Services are not running. Start with: ./manage.sh start"
            exit 1
        fi
        
        # Check health endpoint
        if curl -k -f -s https://localhost:${HTTPS_PORT}/health > /dev/null; then
            print_status "Application is healthy!"
            echo ""
            print_info "Access your application at:"
            echo "  https://localhost:${HTTPS_PORT}"
            echo "  https://$(hostname -I | awk '{print $1}'):${HTTPS_PORT}"
        else
            print_warning "Application may still be starting. Checking container health..."
            docker-compose ps
            echo ""
            print_info "If services show as healthy, wait a moment and try again."
            print_info "Check logs with: ./manage.sh logs"
        fi
        ;;
        
    "reset")
        print_warning "This will stop all services and DELETE ALL DATA!"
        read -p "Are you sure? Type 'yes' to continue: " confirm
        
        if [[ "$confirm" == "yes" ]]; then
            check_compose
            print_info "Stopping services and removing data..."
            docker-compose down -v
            docker system prune -f
            print_status "Reset complete. All data has been deleted."
            echo ""
            print_info "To set up again, run: ./setup.sh"
        else
            print_info "Reset cancelled."
        fi
        ;;
        
    "")
        show_help
        ;;
        
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac